import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import { WebPort, ApplicationStatus } from "@core/ports.ts";
import { AppError } from "@core/errors.ts";
import { createLoginRouter, createLogoutRouter } from "./features/login/handler.tsx";
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
 * Orchestrates middleware, security, and routing via modular sub-routers.
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
    if (this.app.routes.length > 0) return; // Prevent double initialization
    // 1. Core Logging & Metrics (High-Fidelity)
    this.app.use("*", async (c, next) => {
      const start = Date.now();
      const traceId = crypto.randomUUID().slice(0, 8);
      const { method, path } = c.req;
      
      // Mask sensitive data in logs
      const body = await c.req.parseBody().catch(() => ({}));
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
            destination: "LOCAL:8001",
            protocol: "HTTP",
            length: Number(c.req.header("Content-Length") || 0),
            action: "ALLOW"
        });
      }

      await next();
      
      const duration = Date.now() - start;
      await loggingService.log(`[RES:${traceId}] ${method} ${path} -> ${c.res.status} (${duration}ms)`, SyslogSeverity.INFORMATIONAL, "WEB:API");
    });

    // 2. Error Handling
    this.app.onError((err, c) => {
      const errorMsg = (err as Error).message;
      if (err instanceof AppError) {
        loggingService.log(`[WEB:FAIL] ${errorMsg}`, SyslogSeverity.WARNING, "WEB:API", { code: err.statusCode });
        return c.json(err.toJSON(), err.statusCode as any);
      }
      loggingService.log(`[WEB:CRITICAL] ${errorMsg}`, SyslogSeverity.ERROR, "WEB:API", { stack: (err as Error).stack });
      return c.json({ error: "Internal Server Error", code: "SERVER_FAULT" }, 500);
    });

    // 3. Static Assets (Unified)
    // In release mode, we serve from ./web. In dev mode, we serve from src/...
    const webRoot = await Deno.stat("./web").then(s => s.isDirectory).catch(() => false) 
      ? "./web" 
      : "./src/orchestrator/interface/web";
      
    this.app.get("/features/*", serveStatic({ root: webRoot }));
    this.app.get("/components/*", serveStatic({ root: webRoot }));
    this.app.get("/pages/*", serveStatic({ root: webRoot }));
    this.app.get("/vendor/*", serveStatic({ root: webRoot }));
    this.app.get("/assets/*", serveStatic({ root: webRoot }));
    this.app.get("/style.css", serveStatic({ root: webRoot }));
    
    // 4. Deception: Honey-Endpoints (Publicly visible traps)
    const honeyRoutes = ["/admin", "/.git/config", "/wp-config.php", "/.env", "/config.json"];
    honeyRoutes.forEach(route => {
      this.app.get(route, async (c) => {
        const ip = c.req.header("X-Forwarded-For") || c.req.header("Remote-Addr") || "unknown";
        loggingService.log(`[HONEYPOT] Web Decoy Triggered: Access to ${route} from ${ip}`, SyslogSeverity.CRITICAL);
        
        // Notify deception service
        await this.services.honeypot.onWebTrigger(route, ip);
        
        return c.json({ 
          error: "Unauthorized access detected. Security event logged.", 
          code: "DECEPTION_TRAP" 
        }, 403);
      });
    });

    // 5. Public Access (Auth, Login, Logout)
    this.app.route("/login", createLoginRouter({
      checkLoginRateLimit: this.checkLoginRateLimit.bind(this),
      isTokenValid: (t) => this.isTokenValid(t),
      sessionService: this.services.sessions,
      config: this.services.config
    }));
    this.app.route("/logout", createLogoutRouter({
      sessionService: this.services.sessions
    }));

    // 5. Global Security Layer
    this.app.use("*", this.security.auth());

    // 6. Primary Routing Modules
    const statusAggregator = () => this.getSystemStatus();
    this.app.route("/", createUiRouter(this.services, this.security, statusAggregator));
    this.app.route("/api", createApiRouter(this.services, this.security));

    // 7. Real-time Events (WebSockets)
    this.app.get("/api/ws/events", upgradeWebSocket(() => wsHandler));
  }

  /**
   * Aggregates system telemetry for UI consumption.
   */
  private async getSystemStatus(): Promise<ApplicationStatus> {
    console.log("[WEB] Starting system status aggregation...");
    const { bootstrap } = await import("../../bootstrapper.ts");
    const baseStatus = await bootstrap();
    console.log("[WEB] Base status retrieved.");
    
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

  /**
   * Bridge for the legacy login handler (to be refactored next).
   */
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

      if (limit.count > 5) {
          return { allowed: false, retryAfterMs: limit.resetAt - now };
      }
      return { allowed: true };
  }

  async start(port: number = 8000): Promise<void> {
    await this.initialize();

    if (this.meshAuth) {
      console.log(`[WEB] Starting SOVEREIGN mTLS Orchestrator Engine on port ${port}...`);
      const nodeCert = await this.meshAuth.generateNodeCert(Deno.hostname());
      const rootCA = await this.meshAuth.getRootCA();
      
      // Enforce Tier-5 Sovereignty: Only clients with valid mesh certificates can connect.
      await Deno.serve({ 
        port,
        cert: nodeCert.cert,
        key: nodeCert.key
      }, this.app.fetch);
    } else {
      console.log(`[WEB] Orchestrator Engine active on port ${port} (INSECURE MODE)`);
      await Deno.serve({ port }, this.app.fetch);
    }
  }
}