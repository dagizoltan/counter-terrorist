import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import { getCookie } from "hono/helper/cookie/index.ts";
import { WebPort, ApplicationStatus } from "@core/ports.ts";
import { AppError } from "@core/errors.ts";
import { createLoginRouter, createLogoutRouter } from "./features/auth/login/handler.tsx";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { createWsHandler } from "@api/ws.ts";
import { ServiceContainer } from "@core/container.ts";
import { SecurityMiddleware } from "./middleware/security.ts";
import { createUiRouter } from "./routes/ui.tsx";
import { createApiRouter } from "./routes/api.tsx";
import { MeshAuthService } from "@domain/index.ts";

/**
 * WebAdapter
 * The primary ingress controller for the Security Orchestrator.
 */
export class WebAdapter implements WebPort {
  private app: Hono;
  private security: SecurityMiddleware;
  private meshAuth?: MeshAuthService;

  constructor(private services: ServiceContainer) {
    const masterToken = services.config.getToken();
    if (!masterToken) throw new Error("CRITICAL: API_TOKEN not configured");

    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "WEB",
        message: `Initializing with services: ${Object.keys(services).join(", ")}`
    });
    if (!services.honeypot) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "WEB",
            message: "CRITICAL: honeypot service is MISSING in container!"
        });
    }

    this.meshAuth = services.meshAuth;
    this.security = new SecurityMiddleware(services, masterToken);
    this.app = new Hono();
  }

  private async initialize() {
    if (this.app.routes.length > 0) return;
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "WEB",
        message: "Initializing routes and middleware..."
    });
    
    this.app.use("*", this.security.hardenedHeaders());

    // Unified Logging, Metrics, and Audit Lifecycle
    this.app.use("*", async (c, next) => {
      const start = Date.now();
      const traceId = crypto.randomUUID().slice(0, 8);
      const { method, path } = c.req;
      
      // 1. FAST PATH: WebSocket Upgrades must bypass middleware logic that touches the request body or response
      if (c.req.header("upgrade") === "websocket") {
        return await next();
      }

      // 2. Logging (No body parsing here to avoid stream consumption issues)
      await loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "WEB:API",
        message: `[REQ:${traceId}] ${method} ${path}`
      });

      if (this.services.networkLogs) {
        const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "127.0.0.1";
        await this.services.networkLogs.log({
            direction: "INBOUND",
            source: ip,
            destination: `LOCAL:${c.req.header("host") || "8000"}`,
            protocol: "HTTP",
            length: Number(c.req.header("Content-Length") || 0),
            action: "ALLOW"
        });
      }

      const result = await next();
      
      const duration = Date.now() - start;
      const status = c.res.status;
      await loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "WEB:API",
        message: `[RES:${traceId}] ${method} ${path} -> ${status} (${duration}ms)`
      });

      // 3. COMPLIANCE: Audit state-changing requests
      const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
      const isSuccess = status >= 200 && status < 300;
      const isSensitiveApi = path.startsWith("/api/admin") || path.startsWith("/api/mesh") || path.startsWith("/api/agents");

      if (isMutation && isSuccess && isSensitiveApi) {
          const actor = this.security.getActor(c);
          await this.services.audit.logEvent({
              type: "ADMIN_ACTION",
              message: `${actor.id} executed ${method} on ${path}`,
              actor,
              data: { method, path, status, duration }
          });
      }
      
      return result;
    });

    this.app.onError((err, c) => {
      const errorMsg = (err as Error).message;
      if (err instanceof AppError) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "WEB:API",
          message: `[WEB:FAIL] ${errorMsg}`,
          payload: { code: err.statusCode }
        });
        return c.json(err.toJSON(), err.statusCode as any);
      }
      loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "WEB:API",
        message: `[WEB:CRITICAL] ${errorMsg}`,
        payload: { stack: (err as Error).stack }
      });
      return c.json({ error: "Internal Server Error", code: "SERVER_FAULT" }, 500);
    });

    // ── STATIC ASSETS ────────────────────────────────────────────────
    const webRoot = await Deno.stat("./web").then(s => s.isDirectory).catch(() => false) 
      ? "./web" 
      : "./src/orchestrator/interface/web";
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "WEB",
        message: `Static Asset Root: ${webRoot}`
    });
    
    // Optimized static serving for Deno
    this.app.use("/style.css", serveStatic({ path: "./style.css", root: webRoot }));
    this.app.use("/features/*", serveStatic({ root: webRoot }));
    this.app.use("/components/*", serveStatic({ root: webRoot }));
    this.app.use("/pages/*", serveStatic({ root: webRoot }));
    this.app.use("/vendor/*", serveStatic({ root: webRoot }));
    this.app.use("/assets/*", serveStatic({ root: webRoot }));
    this.app.use("/theme.ts", serveStatic({ path: "./theme.ts", root: webRoot }));
    
    if (this.services.honeypot) {
      const honeyRoutes = this.services.honeypot.getDecoyRoutes();
      honeyRoutes.forEach(route => {
        this.app.get(route, async (c) => {
          const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "unknown";
          loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.CRITICAL,
            caller: "HONEYPOT",
            message: `[HONEYPOT] Web Decoy Triggered: Access to ${route} from ${ip}`
          });
          await this.services.honeypot.onWebTrigger(route, ip);
          return c.json({ error: "Unauthorized access detected. Security event logged.", code: "DECEPTION_TRAP" }, 403);
        });
      });
    } else {
      loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.DEBUG,
        severity: LogSeverity.WARNING,
        caller: "WEB",
        message: "[WEB] Honeypot service unavailable. Skipping decoy routes."
      });
    }

    this.app.route("/login", createLoginRouter({
      checkLoginRateLimit: this.checkLoginRateLimit.bind(this),
      isTokenValid: (t) => this.isTokenValid(t),
      sessionService: this.services.sessions,
      config: this.services.config
    }));
    this.app.route("/logout", createLogoutRouter({ sessionService: this.services.sessions }));

    // Security: Handle trailing slash for auth routes to prevent 404/401 loops
    this.app.get("/login/", (c) => c.redirect("/login"));

    this.app.use("*", this.security.auth());

    const statusAggregator = () => this.getSystemStatus();
    this.app.route("/api", createApiRouter(this.services, this.security));
    this.app.route("/", createUiRouter(this.services, this.security, statusAggregator));

    this.app.get("/api/ws/events", upgradeWebSocket(async (c) => {
      let role: string | null = null;
      
      // 1. Try Bearer Token or Query Parameter
      const token = c.req.query("token") || c.req.header("Authorization")?.replace("Bearer ", "");
      if (token) {
        role = await this.isTokenValid(token);
      }
      
      // 2. Try Session Cookie (Fallback)
      if (!role) {
        const sessionId = getCookie(c, "session_token");
        if (sessionId) {
          const result = await this.services.sessions.validateSession(sessionId);
          if (result.success && result.data) {
            role = result.data.role || "viewer";
          }
        }
      }
      
      if (!role) {
        const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "unknown";
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "WS:AUTH",
          message: `Unauthorized WebSocket connection attempt from ${ip}`
        });
        return {
          onOpen: (_event, ws) => {
            ws.close(1008, "Unauthorized");
          }
        };
      }
      
      return createWsHandler(role);
    }));
  }

  private async getSystemStatus(): Promise<ApplicationStatus> {
    const { bootstrap } = await import("../../bootstrapper.ts");
    const baseStatus = await bootstrap();
    
    return {
      ...baseStatus,
      platform: this.services.platformInfo,
      plugins: Object.values(await import("@infrastructure/runtime/sidecar_registry.ts").then(m => m.SIDECAR_REGISTRY)).map(s => {
        let isRunning = this.services.command.isRunning(s.name);
        let status = isRunning ? "ACTIVE" : "INACTIVE";

        // Hybrid Status Logic: Map services to the 'Agent' view
        if (s.name === 'vpn' && this.services.anonymization) {
            status = this.services.anonymization.getTelemetry().status;
        } else if (s.name === 'mesh' && this.services.mesh) {
            status = "ACTIVE"; // Core Mesh is always initialized in boot
        } else if (s.name === 'firewall' && this.services.protection) {
            isRunning = this.services.command.isRunning('blocker');
            status = isRunning ? "ACTIVE" : "INACTIVE";
        }

        return {
          name: s.name,
          description: s.description,
          status,
          details: status === "ACTIVE" ? "Operational" : "Offline / Standby"
        };
      })
    };
  }

  private async isTokenValid(token: string | undefined): Promise<string | null> {
    const isMaster = await import("@infrastructure/system/validation.ts").then(m => 
      m.secureCompare(token, this.services.config.getToken())
    );
    if (isMaster) return "admin";

    const result = await this.services.apiKeys.validateApiKey(token);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  }

  private async checkLoginRateLimit(ip: string) {
      // Hardened Login Rate Limit: 10 attempts per minute (more conservative for login)
      const result = await this.services.rateLimit.checkLimit(`login:${ip}`, 10, 60000);
      if (!result.allowed) return { allowed: false, retryAfterMs: result.retryAfterMs };
      return { allowed: true };
  }

  async start(port: number = 8000): Promise<void> {
    await this.initialize();

    const useHttps = this.meshAuth && Deno.env.get("DISABLE_HTTPS") !== "true";

    if (useHttps && this.meshAuth) {
      const nodeCert = await this.meshAuth.generateNodeCert(Deno.hostname());
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "WEB",
          message: `SOVEREIGN mTLS Active. Tactical Console: https://localhost:${port}`
      });
      
      await Deno.serve({ 
        port,
        cert: nodeCert.cert,
        key: nodeCert.key
      }, this.app.fetch);
    } else {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "WEB",
          message: `Orchestrator Engine active (INSECURE HTTP). Tactical Console: http://localhost:${port}`
      });
      await Deno.serve({ port }, this.app.fetch);
    }
  }
}