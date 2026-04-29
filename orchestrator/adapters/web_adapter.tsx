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
import { Dashboard } from "../views/Dashboard.tsx";
import { Login } from "../views/Login.tsx";
import { AppError } from "../core/errors.ts";
import { loggingService, SyslogSeverity } from "../infrastructure/logging.ts";
import { wsHandler } from "../api/ws.ts";
import { broadcast } from "../api/ws.ts";
import { isValidIP, secureCompareBytes } from "../infrastructure/validation.ts";
import { createReportsApi } from "../api/reports.ts";
import { createNotificationsApi } from "../api/notifications.ts";
import { createAuditApi } from "../api/audit.ts";
import { AuditService, NotificationService, BaselineService, ProcessTracker } from "../services/index.ts";

export class WebAdapter implements WebPort {
  private app: Hono;
  private token: string | undefined;
  private hashedTokenPromise: Promise<Uint8Array> | undefined;

  constructor(
    private config: ConfigurationPort,
    private protection: ProtectionPort,
    private command: CommandPort,
    private dashboardStatus: ApplicationStatus,
    private platformInfo: { name: string; version: string; tag: string },
    private auditService: AuditService,
    private notificationService: NotificationService,
    private baselineService: BaselineService,
    private processTracker: ProcessTracker,
  ) {
    this.token = config.getToken();
    if (this.token) {
      const encoder = new TextEncoder();
      const data = encoder.encode(this.token);
      this.hashedTokenPromise = crypto.subtle.digest("SHA-256", data).then((hash) => new Uint8Array(hash));
    }
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
    const allowedOrigins = allowedOriginsStr
      ? allowedOriginsStr.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
      : [];

    // Security: Only enable CORS if origins are explicitly configured.
    // If ALLOWED_ORIGINS is empty or not set, CORS will default to denying all cross-origin requests.
    if (allowedOrigins.length > 0) {
      this.app.use(
        "/api/*",
        cors({
          origin: allowedOrigins,
          credentials: true,
        }),
      );
    }

    const authMiddleware = async (c: Context, next: Next) => {
      const sessionToken = getCookie(c, "session_token");
      if (await this.isTokenValid(sessionToken)) {
        // CSRF protection for state-changing methods when using cookie auth
        const method = c.req.method;
        if (method === "POST" || method === "DELETE" || method === "PUT" || method === "PATCH") {
          const ctToken = c.req.header("X-CT-Token");
          if (!(await this.isTokenValid(ctToken))) {
            loggingService.log(`[AUTH] CSRF attempt blocked: Missing or invalid X-CT-Token header for ${method} ${c.req.path}`, SyslogSeverity.WARNING);
            return c.json({ error: "CSRF Protection: X-CT-Token header required" }, 403);
          }
        }
        return next();
      }

      const authHeader = c.req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const bearerToken = authHeader.substring(7);
        if (await this.isTokenValid(bearerToken)) {
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

    this.app.use("/api/*", authMiddleware);
    this.app.use("/", authMiddleware);
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

    this.app.get("/api/status", (c: Context) => {
      return c.json(this.dashboardStatus);
    });

    // Agent status
    this.app.get("/api/agent/status", async (c: Context) => {
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
    this.app.post("/api/protection/firewall/block", async (c: Context) => {
      const { ip } = await c.req.json();
      if (!ip || !isValidIP(ip)) {
        return c.json({ success: false, message: "Invalid IP address" }, 400);
      }
      const result = await this.protection.firewall.blockIp(ip);
      return c.json(result);
    });

    this.app.delete("/api/protection/firewall/block/:ip", async (c: Context) => {
      const ip = c.req.param("ip");
      if (!ip || !isValidIP(ip)) {
        return c.json({ success: false, message: "Invalid IP address" }, 400);
      }
      const result = await this.protection.firewall.unblockIp(ip);
      return c.json(result);
    });

    this.app.get("/api/protection/vpn/status", async (c: Context) => {
      const connected = await this.protection.vpn.isConnected();
      return c.json({ connected });
    });

    this.app.get("/api/protection/av/status", async (c: Context) => {
      const status = await this.protection.antivirus.getStatus();
      return c.json(status);
    });

    this.app.post("/api/protection/rkhunter/scan", async (c: Context) => {
      const result = await this.protection.rkhunter.runScan();
      return c.json(result);
    });

    // Baseline
    this.app.post("/api/baseline/set", async (c: Context) => {
      const result = await this.baselineService.setBaseline();
      return c.json(result);
    });

    this.app.post("/api/baseline/check", async (c: Context) => {
      const result = await this.baselineService.checkDrift();
      return c.json(result);
    });

    // WebSocket
    this.app.get("/api/ws/events", upgradeWebSocket(() => wsHandler));

    // Login
    this.app.get("/login", (c: Context) => {
      return c.html(<Login />);
    });

    this.app.post("/login", async (c: Context) => {
      let token: string | undefined;
      const contentType = c.req.header("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        const body = await c.req.json();
        token = body.token;
      } else {
        const body = await c.req.parseBody();
        token = body.password as string;
      }

      if (token && (await this.isTokenValid(token))) {
        setCookie(c, "session_token", token, {
          httpOnly: true,
          secure: false, // For development
          sameSite: "Strict",
          maxAge: 86400, // 24 hours
        });
        if (contentType && contentType.includes("application/json")) {
            return c.json({ success: true });
        }
        return c.redirect("/");
      }
      return c.json({ error: "Invalid token" }, 401);
    });

    // Dashboard
    this.app.get("/", (c: Context) => {
      return c.html(<Dashboard status={this.dashboardStatus} />);
    });

    // Static assets
    this.app.get(
      "/components/*",
      serveStatic({
        root: "./public",
      }),
    );

    this.app.get(
      "/static/*",
      serveStatic({
        root: "./public",
      }),
    );

    // Processes
    this.app.get("/api/processes/tree", (c: Context) => {
      return c.json(this.processTracker.getTree());
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
        await this.protection.firewall.blockIp(payload.ip);
      }
      return c.json({ success: true });
    });

    // API modules
    this.app.route("/api/reports", createReportsApi(this.baselineService, this.protection));
    this.app.route("/api/notifications", createNotificationsApi(this.notificationService));
    this.app.route("/api/audit", createAuditApi(this.auditService));
  }

  private async isTokenValid(tokenToTest: string | undefined): Promise<boolean> {
    if (!tokenToTest || !this.hashedTokenPromise) return false;

    const encoder = new TextEncoder();
    const data = encoder.encode(tokenToTest);
    const testHash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    const secureHash = await this.hashedTokenPromise;

    return secureCompareBytes(testHash, secureHash);
  }

  async start(port: number = 8000): Promise<void> {
    console.log(`[WEB] Starting server on port ${port}`);
    await Deno.serve({ port }, this.app.fetch);
  }
}