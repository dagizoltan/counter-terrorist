import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import { WebPort, ApplicationStatus } from "@core/ports.ts";
import { AppError } from "@core/errors.ts";
import { createLoginRouter, createLogoutRouter } from "./features/auth/login/handler.tsx";
import { loggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";
import { wsHandler } from "@api/ws.ts";
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

    this.meshAuth = services.meshAuth;
    this.security = new SecurityMiddleware(services, masterToken);
    this.app = new Hono();
  }

  private async initialize() {
    if (this.app.routes.length > 0) return;
    
    this.app.use("*", this.security.hardenedHeaders());

    // Unified Logging, Metrics, and Audit Lifecycle
    this.app.use("*", async (c, next) => {
      const start = Date.now();
      const traceId = crypto.randomUUID().slice(0, 8);
      const { method, path } = c.req;
      
      const body = await (method === "GET" ? Promise.resolve({}) : c.req.parseBody().catch(() => ({})));
      const maskedBody = { ...body };
      ["token", "password", "secret", "rawKey"].forEach(k => {
        if (maskedBody[k]) maskedBody[k] = "********";
      });

      await loggingService.log(`[REQ:${traceId}] ${method} ${path}`, SyslogSeverity.INFORMATIONAL, "WEB:API", { body: maskedBody });

      if (this.services.networkLogs) {
        const ip = c.req.header("X-Forwarded-For") || "127.0.0.1";
        await this.services.networkLogs.log({
            direction: "INBOUND",
            source: ip,
            destination: `LOCAL:${c.req.header("host") || "8000"}`,
            protocol: "HTTP",
            length: Number(c.req.header("Content-Length") || 0),
            action: "ALLOW"
        });
      }

      await next();
      
      const duration = Date.now() - start;
      const status = c.res.status;
      await loggingService.log(`[RES:${traceId}] ${method} ${path} -> ${status} (${duration}ms)`, SyslogSeverity.INFORMATIONAL, "WEB:API");

      // ── COMPLIANCE: Audit state-changing requests ───────────────────
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
    });

    this.app.onError((err, c) => {
      const errorMsg = (err as Error).message;
      if (err instanceof AppError) {
        loggingService.log(`[WEB:FAIL] ${errorMsg}`, SyslogSeverity.WARNING, "WEB:API", { code: err.statusCode });
        return c.json(err.toJSON(), err.statusCode as any);
      }
      loggingService.log(`[WEB:CRITICAL] ${errorMsg}`, SyslogSeverity.ERROR, "WEB:API", { stack: (err as Error).stack });
      return c.json({ error: "Internal Server Error", code: "SERVER_FAULT" }, 500);
    });

    // ── STATIC ASSETS ────────────────────────────────────────────────
    const webRoot = await Deno.stat("./web").then(s => s.isDirectory).catch(() => false) 
      ? "./web" 
      : "./src/orchestrator/interface/web";
    
    // Use path-specific serveStatic for better reliability in Deno
    this.app.use("/style.css", serveStatic({ path: "./style.css", root: webRoot }));
    this.app.use("/features/*", serveStatic({ root: webRoot }));
    this.app.use("/components/*", serveStatic({ root: webRoot }));
    this.app.use("/pages/*", serveStatic({ root: webRoot }));
    this.app.use("/vendor/*", serveStatic({ root: webRoot }));
    this.app.use("/assets/*", serveStatic({ root: webRoot }));
    
    const honeyRoutes = this.services.honeypot.getDecoyRoutes();
    honeyRoutes.forEach(route => {
      this.app.get(route, async (c) => {
        const ip = c.req.header("X-Forwarded-For") || c.req.header("Remote-Addr") || "unknown";
        loggingService.log(`[HONEYPOT] Web Decoy Triggered: Access to ${route} from ${ip}`, SyslogSeverity.CRITICAL);
        await this.services.honeypot.onWebTrigger(route, ip);
        return c.json({ error: "Unauthorized access detected. Security event logged.", code: "DECEPTION_TRAP" }, 403);
      });
    });

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
        loggingService.log(`[WS:AUTH] Unauthorized WebSocket connection attempt from ${c.req.header("X-Forwarded-For") || "unknown"}`, SyslogSeverity.WARNING);
        return {
          onOpen: (_event, ws) => {
            ws.close(1008, "Unauthorized");
          }
        };
      }
      
      return wsHandler;
    }));
  }

  private async getSystemStatus(): Promise<ApplicationStatus> {
    const { bootstrap } = await import("../../bootstrapper.ts");
    const baseStatus = await bootstrap();
    
    return {
      ...baseStatus,
      platform: this.services.platformInfo,
      plugins: Object.values(await import("@infrastructure/runtime/sidecar_registry.ts").then(m => m.SIDECAR_REGISTRY)).map(s => ({
        name: s.name,
        description: s.description,
        status: this.services.command.isRunning(s.name) ? "ACTIVE" : "INACTIVE",
        details: this.services.command.isRunning(s.name) ? "Running" : "Offline / Standby"
      }))
    };
  }

  private async isTokenValid(token: string | undefined) {
    const isMaster = await import("@infrastructure/system/validation.ts").then(m => 
      m.secureCompare(token, this.services.config.getToken())
    );
    if (isMaster) return "admin" as const;

    const result = await this.services.apiKeys.validateApiKey(token);
    return result.success ? result.data : null;
  }

  private loginAttempts = new Map<string, { count: number; resetAt: number }>();

  private checkLoginRateLimit(ip: string) {
      const now = Date.now();
      const limit = this.loginAttempts.get(ip) || { count: 0, resetAt: now + 60000 };
      if (now > limit.resetAt) {
          limit.count = 1;
          limit.resetAt = now + 60000;
      } else {
          limit.count++;
      }
      this.loginAttempts.set(ip, limit);
      if (limit.count > 5) return { allowed: false, retryAfterMs: limit.resetAt - now };
      return { allowed: true };
  }

  async start(port: number = 8000): Promise<void> {
    await this.initialize();

    const useHttps = this.meshAuth && Deno.env.get("DISABLE_HTTPS") !== "true";

    if (useHttps && this.meshAuth) {
      const nodeCert = await this.meshAuth.generateNodeCert(Deno.hostname());
      console.log(`[WEB] SOVEREIGN mTLS Active. Tactical Console: https://localhost:${port}`);
      
      await Deno.serve({ 
        port,
        cert: nodeCert.cert,
        key: nodeCert.key
      }, this.app.fetch);
    } else {
      console.log(`[WEB] Orchestrator Engine active (INSECURE HTTP). Tactical Console: http://localhost:${port}`);
      await Deno.serve({ port }, this.app.fetch);
    }
  }
}