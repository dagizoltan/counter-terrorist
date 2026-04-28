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
import { loggingService, SyslogSeverity } from "../services/logging.ts";
import { wsHandler } from "../api/ws.ts";
import { broadcast } from "../api/ws.ts";
import { isValidIP } from "../services/validation.ts";
import reportsApi from "../api/reports.ts";
import notificationsApi from "../api/notifications.ts";
import auditApi from "../api/audit.ts";

export class WebAdapter implements WebPort {
  private app: Hono;
  private token: string | undefined;

  constructor(
    private config: ConfigurationPort,
    private protection: ProtectionPort,
    private command: CommandPort,
    private dashboardStatus: ApplicationStatus,
    private platformInfo: { name: string; version: string; tag: string },
  ) {
    this.token = config.getToken();
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

    this.app.use(
      "/api/*",
      cors({
        origin: ["http://127.0.0.1:8000", "https://127.0.0.1:8000"],
        credentials: true,
      }),
    );

    const isTokenValid = (tokenToTest: string | undefined): boolean => {
      if (!this.token) return false;
      if (!tokenToTest) return false;
      const encoder = new TextEncoder();
      const a = encoder.encode(tokenToTest);
      const b = encoder.encode(this.token!);
      if (a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
      }
      return diff === 0;
    };

    const authMiddleware = async (c: Context, next: Next) => {
      const sessionToken = getCookie(c, "session_token");
      if (isTokenValid(sessionToken)) {
        return next();
      }

      const authHeader = c.req.header("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const bearerToken = authHeader.substring(7);
        if (isTokenValid(bearerToken)) {
          return next();
        }
      }

      if (c.req.path === "/api/ws/events") {
        const token = c.req.query("token");
        if (isTokenValid(token)) {
          return next();
        }
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

    // WebSocket
    this.app.get("/api/ws/events", upgradeWebSocket(wsHandler));

    // Login
    this.app.get("/login", (c: Context) => {
      return c.html(<Login />);
    });

    this.app.post("/login", async (c: Context) => {
      const { token } = await c.req.json();
      if (token === this.token) {
        setCookie(c, "session_token", token, {
          httpOnly: true,
          secure: false, // For development
          sameSite: "Strict",
          maxAge: 86400, // 24 hours
        });
        return c.json({ success: true });
      }
      return c.json({ error: "Invalid token" }, 401);
    });

    // Dashboard
    this.app.get("/", (c: Context) => {
      return c.html(<Dashboard status={this.dashboardStatus} />);
    });

    // Static assets
    this.app.use(
      "/static/*",
      serveStatic({
        root: "./public",
      }),
    );

    // API modules
    this.app.route("/api/reports", reportsApi);
    this.app.route("/api/notifications", notificationsApi);
    this.app.route("/api/audit", auditApi);
  }

  async start(port: number = 8000): Promise<void> {
    console.log(`[WEB] Starting server on port ${port}`);
    await Deno.serve({ port }, this.app.fetch);
  }
}