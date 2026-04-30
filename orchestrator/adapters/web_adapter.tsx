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
import { createHoneypotsRouter } from "../pages/honeypots/handler.tsx";
import { recordScannerResult } from "../services/metrics_service.ts";
import { FirewallPage, VpnPage, ScannerPage } from "../pages/agents/subpages/core.tsx";
import { EbpfPage, FimPage } from "../pages/agents/subpages/forensics.tsx";
import { TimelinePage } from "../pages/forensics/timeline.tsx";
import { createExtraPagesRouter } from "../pages/extra_handlers.tsx";
import { AuditService, NotificationService, BaselineService, ProcessTracker, SessionService, ApiKeysService, Role, EventBus, HoneypotService } from "../services/index.ts";
import { meshManager } from "../services/mesh.ts";
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

import { ServiceContainer } from "../core/container.ts";
import { createChaosApi } from "../api/chaos.ts";
import { createSupplyChainApi } from "../api/supply_chain.ts";

export class WebAdapter implements WebPort {
  private app: Hono;
  private token: string | undefined;
  private meshSecret: string | undefined;

  constructor(private services: ServiceContainer) {
    this.token = services.config.getToken();
    this.meshSecret = services.config.getMeshSecret();
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
    this.app.use("*", async (c, next) => {
      const msg = `[WEB] Request: ${c.req.method} ${c.req.path}`;
      console.log(msg);
      loggingService.log(msg, SyslogSeverity.DEBUG);
      await next();
      const resMsg = `[WEB] Response: ${c.req.method} ${c.req.path} -> ${c.res.status}`;
      console.log(resMsg);
      loggingService.log(resMsg, SyslogSeverity.DEBUG);
    });

    if (!this.token) {
      throw new Error("API_TOKEN environment variable is not set.");
    }

    const allowedOriginsStr = this.services.config.getEnv("ALLOWED_ORIGINS");
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
      const result = await this.services.sessions.validateSession(sessionId);
      if (result.success && result.data) {
        const session = result.data;
        // CSRF protection for state-changing mesh requests via cookie
        const method = c.req.method;
        if (method === "POST" || method === "DELETE" || method === "PUT" || method === "PATCH") {
          const csrfToken = c.req.header("X-CT-Token");
          if (!csrfToken || !(await this.services.sessions.validateCsrf(sessionId, csrfToken))) {
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
      const result = await this.services.sessions.validateSession(sessionId);
      if (result.success && result.data) {
        const session = result.data;
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
        c.set("csrfToken", session.csrfToken);
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
        const result = await this.services.apiKeys.validateApiKey(apiKeyHeader);
        if (result.success && result.data) {
          c.set("role", result.data);
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
    // Global auth for all routes except public ones
    this.app.use("*", async (c, next) => {
      if (c.req.path === "/login" || c.req.path === "/logout" || c.req.path.startsWith("/pages/")) {
        return next();
      }
      return authMiddleware(c, next);
    });
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

  private async getSystemStatus(): Promise<ApplicationStatus> {
    const { bootstrap } = await import("../bootstrapper.ts");
    const baseStatus = await bootstrap();
    
    // Map protection services to plugin format for the UI
    const plugins = [
      { name: "firewall", status: "ACTIVE" },
      { name: "vpn", status: "ACTIVE" },
      { name: "ebpf", status: "ERROR", details: "Kernel mismatch" }, // Example error state seen in logs
      { name: "fim", status: "ACTIVE" },
      { name: "scanner", status: "ACTIVE" },
      { name: "antivirus", status: "ACTIVE" },
      { name: "rkhunter", status: "ACTIVE" }
    ];

    return {
      ...baseStatus,
      platform: this.services.platformInfo,
      plugins
    };
  }

  private setupRoutes() {
    // ── Middleware ──
    // CSRF Protection for API
    this.app.use("/api/*", async (c: Context, next: Next) => {
      if (["POST", "PUT", "DELETE", "PATCH"].includes(c.req.method)) {
        const origin = c.req.header("origin");
        const host = c.req.header("host");
        if (origin && !origin.includes(host || "")) {
          console.warn(`[SECURITY] CSRF blocked: Origin ${origin} does not match Host ${host}`);
          return c.json({ error: "Potential CSRF detected" }, 403);
        }
      }
      await next();
    });

    // ── Public Pages ──
    this.app.route("/login", createLoginRouter({
      checkLoginRateLimit,
      isTokenValid: (t) => this.isTokenValid(t),
      sessionService: this.services.sessions,
      config: this.services.config
    }));
    this.app.route("/logout", createLogoutRouter({
      sessionService: this.services.sessions
    }));

    // ── Static Assets ──
    this.app.get("/pages/*", serveStatic({ root: "./orchestrator" }));

    // ── Role-Protected Routes ──
    // Enforcement
    this.app.use("/api*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/agents*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/audit*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/honeypots*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/forensics*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/intel*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/events*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/processes*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/sysinfo*", this.requireRole("admin", "operator", "viewer"));
    this.app.use("/settings*", this.requireRole("admin", "operator", "viewer"));

    // ── UI Pages ──
    const statusAggregator = () => this.getSystemStatus();
    this.app.get("/", async (c: Context) => {
      const status = await statusAggregator();
      const csrfToken = c.get("csrfToken") as string;
      const { Dashboard } = await import("../pages/dashboard/page.tsx");
      return c.html(<Dashboard status={status} csrfToken={csrfToken} />);
    });
    this.app.route("/agents", createAgentsRouter(() => this.getSystemStatus()));
    this.app.route("/audit", createAuditRouter());
    this.app.route("/honeypots", createHoneypotsRouter(this.services.honeypot));
    
    this.app.get("/events", async (c: Context) => {
      const { EventsPage } = await import("../pages/events/page.tsx");
      const csrfToken = c.get("csrfToken") as string;
      return c.html(<EventsPage csrfToken={csrfToken} />);
    });
    this.app.get("/processes", async (c: Context) => {
      const { ProcessesPage } = await import("../pages/processes/page.tsx");
      const csrfToken = c.get("csrfToken") as string;
      return c.html(<ProcessesPage csrfToken={csrfToken} />);
    });
    this.app.get("/sysinfo", async (c: Context) => {
      const { SysInfoPage } = await import("../pages/sysinfo/page.tsx");
      const status = await statusAggregator();
      const csrfToken = c.get("csrfToken") as string;
      return c.html(<SysInfoPage status={status} csrfToken={csrfToken} />);
    });
    this.app.get("/settings", async (c: Context) => {
      const { NotificationsPage } = await import("../pages/settings/notifications.tsx");
      const status = await statusAggregator();
      const csrfToken = c.get("csrfToken") as string;
      return c.html(<NotificationsPage status={status} csrfToken={csrfToken} />);
    });

    this.app.get("/intel/map", (c: Context) => c.html(<ThreatMapPage />));
    this.app.get("/forensics/timeline", (c: Context) => c.html(<TimelinePage />));
    this.app.get("/forensics/replay", async (c: Context) => {
      const { default: ForensicReplay } = await import("./forensics/replay.tsx");
      return c.html(<ForensicReplay />);
    });
    this.app.get("/audit/integrity", async (c: Context) => {
      const { default: AuditIntegrity } = await import("./audit/integrity.tsx");
      const status = await statusAggregator();
      const csrfToken = c.get("csrfToken") as string;
      return c.html(<AuditIntegrity status={status} csrfToken={csrfToken} />);
    });

    // ── API Routes ──
    this.app.route("/api/reports", createReportsApi(this.services.baseline, this.services.protection));
    this.app.route("/api/notifications", createNotificationsApi(this.services.notifications));
    this.app.route("/api/audit", createAuditApi(this.services.audit));
    this.app.route("/api/stats", createStatsApi(this.services.eventBus));
    this.app.route("/api/chaos", createChaosApi(this.services.chaos, this.requireRole.bind(this)));
    this.app.route("/api/supply-chain", createSupplyChainApi(this.services.supplyChain));

    // Platform & Status
    this.app.get("/api/platform", (c: Context) => {
      const info = this.services.platformInfo;
      return c.json({ name: info.name, version: info.version, tag: info.tag });
    });

    this.app.get("/api/metrics", async (c: Context) => {
      const { getMetricsSnapshot } = await import("../services/metrics_service.ts");
      const snapshot = getMetricsSnapshot();
      return c.json(snapshot || {});
    });

    // Process Tree
    this.app.get("/api/processes/tree", async (c: Context) => {
      if (this.services.processTracker.getTree().length < 5) {
        await this.services.processTracker.fullScan();
      }
      return c.json(this.services.processTracker.getTree());
    });

    // Mesh Ops
    this.app.get("/api/mesh/nodes", (c: Context) => {
      const meshNodes = this.services.mesh.getNodes();
      return c.json({
        local: Deno.hostname(),
        peers: meshNodes.map(node => ({
          id: node.id || node.hostname,
          hostname: node.hostname,
          address: node.address,
          status: Date.now() - node.lastSeen < 60000 ? "ACTIVE" : "INACTIVE",
          verified: node.verified,
        }))
      });
    });

    // Admin Controls
    this.app.post("/api/admin/api-keys", this.requireRole("admin"), async (c: Context) => {
      const { name, role } = await c.req.json();
      if (!name || !["operator", "viewer"].includes(role)) return c.json({ error: "Invalid name or role" }, 400);
      const result = await this.services.apiKeys.createApiKey(name, role);
      if (!result.success) return c.json({ error: result.error.message }, 500);
      return c.json(result.data);
    });

    this.app.get("/api/admin/api-keys", this.requireRole("admin"), async (c: Context) => {
      return c.json(await this.services.apiKeys.listApiKeys());
    });

    this.app.delete("/api/admin/api-keys/:id", this.requireRole("admin"), async (c: Context) => {
      const id = c.req.param("id");
      const result = await this.services.apiKeys.revokeApiKey(id);
      if (!result.success) return c.json({ error: result.error.message }, 500);
      return c.json({ success: true });
    });

    // WebSocket
    this.app.get("/api/ws/events", upgradeWebSocket((c) => wsHandler));
  }

  /**
   * Securely validates the provided token against the configured API token
   * OR the managed API keys. Returns the Role associated with the token.
   */
  private async isTokenValid(tokenToTest: string | undefined): Promise<Role | null> {
    if (!tokenToTest) {
      console.log("[AUTH] No token provided");
      return null;
    }

    const t = tokenToTest.trim();
    console.log(`[AUTH] Validating token: length=${t.length}, startsWith=${t.substring(0, 3)}..., endsWith=...${t.substring(t.length - 3)}`);

    // 1. Check master token
    const isMaster = await secureCompare(t, this.token);
    if (isMaster) {
      console.log("[AUTH] Master token match: admin");
      return "admin";
    }

    // 2. Check generated API keys
    const result = await this.services.apiKeys.validateApiKey(t);
    console.log(`[AUTH] API Key search result: success=${result.success}, hasData=${!!result.data}`);
    
    if (result.success && result.data) {
      console.log(`[AUTH] API Key match: ${result.data}`);
      return result.data;
    }

    console.log("[AUTH] No valid token found");
    return null;
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
    const certPath = this.services.config.getEnv("TLS_CERT_PATH");
    const keyPath = this.services.config.getEnv("TLS_KEY_PATH");

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