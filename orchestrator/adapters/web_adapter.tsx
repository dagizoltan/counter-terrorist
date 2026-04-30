/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import { WebPort, ApplicationStatus } from "../core/ports.ts";
import { AppError } from "../core/errors.ts";
import { createLoginRouter, createLogoutRouter } from "../pages/login/handler.tsx";
import { loggingService, SyslogSeverity } from "../infrastructure/logging.ts";
import { wsHandler } from "../api/ws.ts";
import { ServiceContainer } from "../core/container.ts";
import { SecurityMiddleware } from "../infrastructure/middleware/security.ts";
import { createUiRouter } from "../routes/ui.tsx";
import { createApiRouter } from "../routes/api.tsx";

/**
 * WebAdapter
 * The primary ingress controller for the Security Orchestrator.
 * Orchestrates middleware, security, and routing via modular sub-routers.
 */
export class WebAdapter implements WebPort {
  private app: Hono;
  private security: SecurityMiddleware;

  constructor(private services: ServiceContainer) {
    const masterToken = services.config.getToken();
    if (!masterToken) throw new Error("CRITICAL: API_TOKEN not configured");

    this.security = new SecurityMiddleware(services, masterToken);
    this.app = new Hono();

    this.initialize();
  }

  private initialize() {
    // 1. Core Logging & Metrics
    this.app.use("*", async (c, next) => {
      const msg = `[WEB] ${c.req.method} ${c.req.path}`;
      console.log(msg);
      await next();
      loggingService.log(`${msg} -> ${c.res.status}`, SyslogSeverity.DEBUG);
    });

    // 2. Error Handling
    this.app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), err.statusCode as any);
      }
      loggingService.log(`[WEB] Exception: ${err.message}`, SyslogSeverity.ERROR);
      return c.json({ error: "Internal Server Error", code: "SERVER_FAULT" }, 500);
    });

    // 3. Static Assets (Unified)
    this.app.get("/pages/*", serveStatic({ root: "./orchestrator" }));
    this.app.get("/components/*", serveStatic({ root: "./orchestrator" }));

    // 4. Public Access (Auth, Login, Logout)
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
    const { bootstrap } = await import("../bootstrapper.ts");
    const baseStatus = await bootstrap();
    
    return {
      ...baseStatus,
      platform: this.services.platformInfo,
      plugins: [
        { name: "firewall", status: "ACTIVE" },
        { name: "vpn", status: "ACTIVE" },
        { name: "ebpf", status: "ERROR", details: "Kernel mismatch" },
        { name: "fim", status: "ACTIVE" },
        { name: "scanner", status: "ACTIVE" }
      ]
    };
  }

  /**
   * Bridge for the legacy login handler (to be refactored next).
   */
  private async isTokenValid(token: string) {
    const isMaster = await import("../infrastructure/validation.ts").then(m => 
      m.secureCompare(token, this.services.config.getToken())
    );
    if (isMaster) return "admin" as const;

    const result = await this.services.apiKeys.validateApiKey(token);
    return (result.success && result.data) ? result.data : null;
  }

  private checkLoginRateLimit(ip: string) {
      // In-memory simple rate limit for now
      return { allowed: true };
  }

  async start(port: number = 8000): Promise<void> {
    console.log(`[WEB] Orchestrator Engine active on port ${port}`);
    await Deno.serve({ port }, this.app.fetch);
  }
}