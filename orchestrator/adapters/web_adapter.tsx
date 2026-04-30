/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Hono, Context, Next } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "hono/helper/cookie/index.ts";
import { cors } from "hono/middleware/cors/index.ts";
import { WebPort, ApplicationStatus, ProtectionPort, CommandPort, ConfigurationPort } from "../core/ports.ts";
import { AppError } from "../core/errors.ts";
import { createDashboardRouter } from "../pages/dashboard/handler.tsx";
import { createLoginRouter, createLogoutRouter } from "../pages/login/handler.tsx";
import { loggingService, SyslogSeverity } from "../infrastructure/logging.ts";
import { wsHandler } from "../api/ws.ts";
import { broadcast } from "../api/ws.ts";
import { isValidIP, secureCompare } from "../infrastructure/validation.ts";
import { createReportsApi } from "../api/reports.ts";
import { createNotificationsApi } from "../api/notifications.ts";
import { createAuditApi } from "../api/audit.ts";
import { createStatsApi } from "../api/stats.ts";
import { createAgentsRouter } from "../pages/agents/handler.tsx";
import { createAuditRouter } from "../pages/audit/handler.tsx";
import { createExtraPagesRouter } from "../pages/extra_handlers.tsx";
import { AuditService, NotificationService, BaselineService, ProcessTracker, SessionService, ApiKeysService, Role, EventBus } from "../services/index.ts";
/**
 * IPs that must never be blocked via mesh sync gossip.
 * Prevents denial-of-service via loopback, link-local, or broadcast blocking.
 */
const MESH_BLOCK_DENY_LIST = [
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::",
  "255.255.255.255",
  "localhost",
];
function isBlockDenied(ip: string): boolean {
  if (MESH_BLOCK_DENY_LIST.includes(ip)) return true;
  // Block link-local (169.254.x.x, fe80::)
  if (ip.startsWith("169.254.")) return true;
  if (ip.toLowerCase().startsWith("fe80:")) return true;
  return false;
}

/**
 * In-memory per-IP rate limiter for login attempts.
 * Tracks attempt timestamps per IP and enforces a sliding window.
 */
interface RateLimitEntry {
  attempts: number[];
}

const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const loginRateLimiter = new Map<string, RateLimitEntry>();

// Periodic cleanup of stale rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginRateLimiter.entries()) {
    entry.attempts = entry.attempts.filter(t => now - t < LOGIN_RATE_LIMIT_WINDOW_MS);
    if (entry.attempts.length === 0) {
      loginRateLimiter.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let entry = loginRateLimiter.get(ip);

  if (!entry) {
    entry = { attempts: [] };
    loginRateLimiter.set(ip, entry);
  }

  // Remove attempts outside the window
  entry.attempts = entry.attempts.filter(t => now - t < LOGIN_RATE_LIMIT_WINDOW_MS);

  if (entry.attempts.length >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    const oldestInWindow = entry.attempts[0];
    const retryAfterMs = LOGIN_RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, retryAfterMs };
  }

  entry.attempts.push(now);
  return { allowed: true };
}

export class WebAdapter implements WebPort {
  private app: Hono;
  private token: string | undefined;
  private meshSecret: string | undefined;

  constructor(
    private config: ConfigurationPort,
    private protection: ProtectionPort,
    private command: CommandPort,
    private auditService: AuditService,
    private notificationService: NotificationService,
    private baselineService: BaselineService,
    private processTracker: ProcessTracker,
    private sessionService: SessionService,
    private apiKeysService: ApiKeysService,
    private eventBus: EventBusPort,
  ) {
    this.token = config.getToken();
    this.meshSecret = config.getMeshSecret();
    this.app = new Hono();

    this.setupMiddleware();
    this.setupErrorHandling();
    this.setupRoutes();
  }

  private setupErrorHandling() {
    this.app.onError((err, c) => {
      if (err instanceof AppError) {
        const status = err.statusCode as Parameters<Context["json"]>[1];
        return c.json(err.toJSON(), status);
      }

      loggingService.log(`[WEB] Unhandled Error: ${err.message}`, SyslogSeverity.ERROR);
      return c.json({
        success: false,
        error: {
          message: "An internal server error occurred",
          code: "INTERNAL_ERROR"
        }
      }, 500);
    });
  }

  private setupMiddleware() {
    if (!this.token) {
      throw new Error("API_TOKEN environment variable is not set.");
    }

    const allowedOriginsStr = this.config.getEnv("ALLOWED_ORIGINS");
    const rawOrigins = allowedOriginsStr
      ? allowedOriginsStr.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
      : [];

    // Security: Filter out wildcards when credentials are enabled to prevent origin reflection attacks.
    const allowedOrigins = rawOrigins.filter((o) => o !== "*");

    if (rawOrigins.includes("*")) {
      loggingService.log(
        "[WEB] SECURITY WARNING: CORS wildcard '*' detected in ALLOWED_ORIGINS while credentials are enabled. This wildcard has been ignored for security.",
        SyslogSeverity.WARNING,
      );
    }

    // Security: Only enable CORS if origins are explicitly configured and valid.
    // We use a function for origin validation to ensure exact matches against the ALLOWED_ORIGINS allowlist.
    // This prevents "Arbitrary Localhost Origins" vulnerabilities where any localhost port might be trusted.
    // By using a validation function, we also avoid Hono's default behavior of echoing the first origin on mismatch.
    if (allowedOrigins.length > 0) {
      this.app.use(
        "/api/*",
        cors({
          origin: (origin) => {
            // Security: We only allow origins that are explicitly listed in the allowlist.
            // Using a wildcard '*' with credentials: true is blocked by browsers,
            // and reflecting the origin here would create a serious security vulnerability.
            return allowedOrigins.includes(origin) ? origin : null;
          },
          allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
          allowHeaders: ["Content-Type", "Authorization", "X-CT-Token", "X-Mesh-Secret"],
          credentials: true,
          maxAge: 600,
        }),
      );
    }

    // --- Mesh-specific authentication middleware ---
    // Mesh peers authenticate with a separate MESH_SECRET, not the user-facing API_TOKEN.
    // This enforces role separation: dashboard users cannot invoke mesh peer operations
    // unless they also possess the mesh secret.
    const meshAuthMiddleware = async (c: Context, next: Next) => {
      // Option 1: Mesh pre-shared key header
      const meshSecretHeader = c.req.header("X-Mesh-Secret");
      if (this.meshSecret && meshSecretHeader) {
        if (await secureCompare(meshSecretHeader, this.meshSecret)) {
          return next();
        }
      }

      // Option 2: Fall through to bearer token (admin API access still works)
      const authHeader = c.req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const bearerToken = authHeader.substring(7);
        if (await this.isTokenValid(bearerToken)) {
          return next();
        }
      }

      // Option 3: Valid session cookie (admin dashboard access)
      const sessionId = getCookie(c, "session_token");
      const session = await this.sessionService.validateSession(sessionId);
      if (session) {
        // CSRF protection for state-changing mesh requests via cookie
        const method = c.req.method;
        if (method === "POST" || method === "DELETE" || method === "PUT" || method === "PATCH") {
          const csrfToken = c.req.header("X-CT-Token");
          if (!csrfToken || !(await this.sessionService.validateCsrf(sessionId, csrfToken))) {
            return c.json({ error: "CSRF Protection: X-CT-Token header required" }, 403);
          }
        }
        return next();
      }

      loggingService.log(`[AUTH] Mesh auth rejected for ${c.req.method} ${c.req.path}`, SyslogSeverity.WARNING);
      return c.json({ error: "Unauthorized: Mesh endpoints require X-Mesh-Secret or admin bearer token" }, 401);
    };

    // --- Standard user/API authentication middleware ---
    const authMiddleware = async (c: Context, next: Next) => {
      // 1. Session cookie auth (cookie contains a random session ID, NOT the API token)
      const sessionId = getCookie(c, "session_token");
      const session = await this.sessionService.validateSession(sessionId);
      if (session) {
        c.set("role", session.role || "admin");
        
        // CSRF protection for state-changing methods when using cookie auth
        const method = c.req.method;
        if (method === "POST" || method === "DELETE" || method === "PUT" || method === "PATCH") {
          const csrfToken = c.req.header("X-CT-Token");
          if (!csrfToken || !session.csrfToken || !this.timingSafeEqual(csrfToken, session.csrfToken)) {
            loggingService.log(`[AUTH] CSRF attempt blocked: Missing or invalid X-CT-Token header for ${method} ${c.req.path}`, SyslogSeverity.WARNING);
            return c.json({ error: "CSRF Protection: X-CT-Token header required" }, 403);
          }
        }
        return next();
      }

      // 2. Bearer token auth (for API/automation clients — uses the real API_TOKEN)
      const authHeader = c.req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const bearerToken = authHeader.substring(7);
        if (await this.isTokenValid(bearerToken)) {
          c.set("role", "admin"); // Root token is always admin
          return next();
        }
      }

      // 3. API Key auth (for scoped operator/viewer roles)
      const apiKeyHeader = c.req.header("X-Api-Key");
      if (apiKeyHeader) {
        const role = await this.apiKeysService.validateApiKey(apiKeyHeader);
        if (role) {
          c.set("role", role);
          return next();
        }
      }

      if (c.req.path === "/api/ws/events") {
        // WebSocket must rely on session cookie or bearer token in headers
        // Falling back to query param token is deprecated/insecure
        return c.json({ error: "Unauthorized: WebSockets require session cookie or bearer token" }, 401);
      }

      if (!c.req.path.startsWith("/api/")) {
        return c.redirect("/login");
      }

      return c.json({ error: "Unauthorized" }, 401);
    };

    // Mesh endpoints use dedicated mesh auth
    this.app.use("/api/mesh/*", meshAuthMiddleware);
    // All other API endpoints and dashboard use standard auth
    this.app.use("/api/*", authMiddleware);
    this.app.use("/", authMiddleware);
  }

  /**
   * Middleware to enforce role-based access control.
   * Must be applied AFTER authMiddleware.
   */
  private requireRole(...allowedRoles: Role[]) {
    return async (c: Context, next: Next) => {
      const role = c.get("role") as Role;
      if (!role) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!allowedRoles.includes(role)) {
        loggingService.log(`[AUTH] Access denied for role '${role}' to ${c.req.method} ${c.req.path}`, SyslogSeverity.WARNING);
        return c.json({ error: "Forbidden: insufficient permissions" }, 403);
      }
      return next();
    };
  }

  private setupRoutes() {
    // Platform info
    this.app.get("/api/platform", (c: Context) => {
      return c.json({
        name: this.platformInfo.name,
        version: this.platformInfo.version,
        tag: this.platformInfo.tag,
      });
    });

    this.app.get("/api/status", this.requireRole("admin", "operator", "viewer"), (c: Context) => {
      return c.json(this.dashboardStatus);
    });

    // Agent status
    this.app.get("/api/agent/status", this.requireRole("admin", "operator", "viewer"), async (c: Context) => {
      const fwStatus = await this.protection.firewall.getStatus();

      let blockerExists = false;
      try {
        const isWindows = Deno.build.os === "windows";
        const extension = isWindows ? ".exe" : "";
        const paths = [
          `./agents/target/release/blocker${extension}`,
          `./agents/target/debug/blocker${extension}`,
        ];
        for (const p of paths) {
          try {
            const info = await Deno.stat(p);
            if (info.isFile) {
              blockerExists = true;
              break;
            }
          } catch {
            continue;
          }
        }
      } catch {
        // Ignore
      }

      return c.json({
        blocker_binary: blockerExists,
        firewall: {
          active: fwStatus.success && fwStatus.stdout.includes("Status: active"),
          details: fwStatus.stdout || fwStatus.stderr,
        },
      });
    });

    // Protection routes
    this.app.post("/api/protection/firewall/block", this.requireRole("admin"), async (c: Context) => {
      const { ip } = await c.req.json();
      if (!ip || !isValidIP(ip)) {
        return c.json({ success: false, message: "Invalid IP address" }, 400);
      }
      const result = await this.protection.firewall.blockIp(ip);
      return c.json(result);
    });

    this.app.delete("/api/protection/firewall/block/:ip", this.requireRole("admin"), async (c: Context) => {
      const ip = c.req.param("ip");
      if (!ip || !isValidIP(ip)) {
        return c.json({ success: false, message: "Invalid IP address" }, 400);
      }
      const result = await this.protection.firewall.unblockIp(ip);
      return c.json(result);
    });

    this.app.post("/api/protection/blocker/kill", this.requireRole("admin"), async (c: Context) => {
      const { pid } = await c.req.json();
      if (!pid || typeof pid !== "number") {
        return c.json({ success: false, message: "Invalid PID" }, 400);
      }
      const result = await this.protection.firewall.killProcess(pid);
      return c.json(result);
    });

    this.app.post("/api/test/simulate-event", this.requireRole("admin"), async (c: Context) => {
      const { sidecar, event } = await c.req.json();
      this.command.emitEvent(sidecar, { event });
      return c.json({ success: true });
    });

    this.app.get("/api/protection/vpn/status", this.requireRole("admin", "operator", "viewer"), async (c: Context) => {
      const connected = await this.protection.vpn.isConnected();
      return c.json({ connected });
    });

    this.app.get("/api/protection/av/status", this.requireRole("admin", "operator", "viewer"), async (c: Context) => {
      const status = await this.protection.antivirus.getStatus();
      return c.json(status);
    });

    this.app.post("/api/protection/rkhunter/scan", this.requireRole("admin", "operator"), async (c: Context) => {
      const result = await this.protection.rkhunter.runScan();
      return c.json(result);
    });

    // Stats
    this.app.route("/api/stats", createStatsApi(this.eventBus));

    // Baseline
    this.app.post("/api/baseline/set", this.requireRole("admin", "operator"), async (c: Context) => {
      const result = await this.baselineService.setBaseline();
      return c.json(result);
    });

    this.app.post("/api/baseline/check", this.requireRole("admin", "operator"), async (c: Context) => {
      const result = await this.baselineService.checkDrift();
      return c.json(result);
    });

    // WebSocket
    this.app.get("/api/ws/events", upgradeWebSocket(() => wsHandler));

    // Login
    this.app.route("/login", createLoginRouter({
      checkLoginRateLimit,
      isTokenValid: (t) => this.isTokenValid(t),
      sessionService: this.sessionService,
      config: this.config
    }));

    // Logout
    this.app.route("/logout", createLogoutRouter({
      sessionService: this.sessionService
    }));

    // Agents
    this.app.route("/agents", createAgentsRouter(async () => {
      const { createDashboardStatus } = await import("../core/application.ts");
      const { pluginManager, getPlatformInfo } = await import("../services/index.ts");
      const { bootstrap } = await import("../bootstrapper.ts");
      const systemStatus = await bootstrap();
      return await createDashboardStatus(systemStatus, { getPlatformInfo }, pluginManager, this.auditService);
    }));

    // Audit
    this.app.route("/audit", createAuditRouter());

    // Extra Pages
    this.app.route("/", createExtraPagesRouter(async () => {
      const { createDashboardStatus } = await import("../core/application.ts");
      const { pluginManager, getPlatformInfo } = await import("../services/index.ts");
      const { bootstrap } = await import("../bootstrapper.ts");
      const systemStatus = await bootstrap();
      return await createDashboardStatus(systemStatus, { getPlatformInfo }, pluginManager, this.auditService);
    }));

    // Dashboard
    this.app.route("/", createDashboardRouter(async () => {
      const { createDashboardStatus } = await import("../core/application.ts");
      const { pluginManager, getPlatformInfo } = await import("../services/index.ts");
      const { bootstrap } = await import("../bootstrapper.ts");
      const systemStatus = await bootstrap();
      return await createDashboardStatus(systemStatus, { getPlatformInfo }, pluginManager, this.auditService);
    }));

    // Static assets
    this.app.get(
      "/pages/*",
      serveStatic({
        root: "./orchestrator",
      }),
    );

    // Processes
    this.app.get("/api/processes/tree", async (c: Context) => {
      // If tree is very small or empty, trigger a scan
      if (this.processTracker.getTree().length < 5) {
        await this.processTracker.fullScan();
      }
      return c.json(this.processTracker.getTree());
    });

    // Protection Controls
    this.app.post("/api/protection/lockdown", async (c: Context) => {
      const result = await this.protection.lockdown();
      return c.json(result);
    });

    // Agent Controls
    this.app.post("/api/agents/:name/restart", async (c: Context) => {
      const name = c.req.param("name");
      await this.command.restartSidecar(name);
      return c.json({ success: true, message: `Agent ${name} restarted.` });
    });

    this.app.post("/api/agents/:name/stop", async (c: Context) => {
      const name = c.req.param("name");
      await this.command.stopSidecar(name);
      return c.json({ success: true, message: `Agent ${name} stopped.` });
    });

    // Mesh
    this.app.get("/api/mesh/ping", (c: Context) => {
      return c.json({ success: true, nodeId: Deno.hostname(), timestamp: Date.now() });
    });

    this.app.post("/api/mesh/sync", async (c: Context) => {
      const payload = await c.req.json();
      console.log(`[MESH] Received sync from peer:`, payload);
      // Process gossip payload (e.g. block IP)
      if (payload.type === "GOSSIP_BLOCK" && payload.ip) {
        // Security: Validate IP format and block deny-listed IPs
        if (!isValidIP(payload.ip)) {
          loggingService.log(`[MESH] Rejected gossip block: invalid IP '${payload.ip}'`, SyslogSeverity.WARNING);
          return c.json({ success: false, error: "Invalid IP address" }, 400);
        }
        if (isBlockDenied(payload.ip)) {
          loggingService.log(`[MESH] Rejected gossip block: deny-listed IP '${payload.ip}'`, SyslogSeverity.WARNING);
          return c.json({ success: false, error: "IP is in the deny list (loopback/link-local)" }, 400);
        }
        await this.protection.firewall.blockIp(payload.ip);
      }
      return c.json({ success: true });
    });

    // Enforce roles on sub-routers
    this.app.use("/api/reports/*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/api/notifications/*", this.requireRole("admin"));
    this.app.use("/api/audit/*", this.requireRole("admin", "operator", "viewer"));

    // API modules
    this.app.route("/api/reports", createReportsApi(this.baselineService, this.protection));
    this.app.route("/api/notifications", createNotificationsApi(this.notificationService));
    this.app.route("/api/audit", createAuditApi(this.auditService));

    // Admin: API Key Management
    this.app.post("/api/admin/api-keys", this.requireRole("admin"), async (c: Context) => {
      const { name, role } = await c.req.json();
      if (!name || !["operator", "viewer"].includes(role)) {
        return c.json({ error: "Invalid name or role" }, 400);
      }
      const result = await this.apiKeysService.createApiKey(name, role);
      return c.json(result);
    });

    this.app.get("/api/admin/api-keys", this.requireRole("admin"), async (c: Context) => {
      const keys = await this.apiKeysService.listApiKeys();
      return c.json({ keys });
    });

    this.app.delete("/api/admin/api-keys/:id", this.requireRole("admin"), async (c: Context) => {
      const id = c.req.param("id");
      await this.apiKeysService.revokeApiKey(id);
      return c.json({ success: true });
    });
  }

  /**
   * Securely validates the provided token against the configured API token.
   * Uses HMAC-based constant-time comparison (via secureCompare) to prevent timing attacks
   * and avoid leaking the length or content of the secret token.
   */
  private async isTokenValid(tokenToTest: string | undefined): Promise<boolean> {
    return await secureCompare(tokenToTest, this.token);
  }

  /**
   * Simple constant-time string comparison for CSRF tokens.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  async start(port: number = 8000): Promise<void> {
    const certPath = this.config.getEnv("TLS_CERT_PATH");
    const keyPath = this.config.getEnv("TLS_KEY_PATH");

    if (certPath && keyPath) {
      try {
        const cert = await Deno.readTextFile(certPath);
        const key = await Deno.readTextFile(keyPath);

        console.log(`[WEB] Starting HTTPS server on port ${port} (TLS enabled)`);
        await Deno.serve({ port, cert, key }, this.app.fetch);
      } catch (e) {
        console.error(`[WEB] Failed to load TLS certificates: ${e}`);
        console.error(`[WEB] cert: ${certPath}, key: ${keyPath}`);
        throw new Error(`TLS configuration failed: ${e}`);
      }
    } else {
      loggingService.log(
        "[WEB] SECURITY WARNING: Running HTTP without TLS. Set TLS_CERT_PATH and TLS_KEY_PATH for HTTPS.",
        SyslogSeverity.WARNING,
      );
      console.log(`[WEB] Starting HTTP server on port ${port} (no TLS)`);
      await Deno.serve({ port }, this.app.fetch);
    }
  }
}