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
import { getMetricsSnapshot } from "@domain/analysis/metrics_service.ts";

/**
 * WebAdapter
 * The primary ingress controller for the Security Orchestrator.
 */
export class WebAdapter implements WebPort {
  private app: Hono;
  private security: SecurityMiddleware;
  private meshAuth?: MeshAuthService;
  private server?: Deno.HttpServer;

  constructor(private services: ServiceContainer) {
    const masterToken = services.config.getToken();
    if (!masterToken) throw new Error("CRITICAL: API_TOKEN not configured");

    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:interface:web",
        message: `Initializing with services: ${Object.keys(services).join(", ")}`
    });

    this.meshAuth = services.meshAuth;
    this.security = new SecurityMiddleware(services, masterToken);
    this.app = new Hono();
  }

  private async initialize() {
    if (this.app.routes.length > 0) return;
    
    // ── DECEPTION GRID (HONEYPOT) - MUST BE FIRST ─────────────────────
    // These routes must bypass all security and logging middleware to capture raw attacker data.
    if (this.services.honeypot) {
      const honeyRoutes = this.services.honeypot.getDecoyRoutes();
      honeyRoutes.forEach(route => {
        this.app.get(route, async (c) => {
          const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "unknown";
          loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:interface:web:api:honeypot",
            message: `[HONEYPOT] Web Decoy Triggered: Access to ${route} from ${ip}`
          });
          await this.services.honeypot.onWebTrigger(route, ip);
          return c.json({ error: "Unauthorized access detected. Security event logged.", code: "DECEPTION_TRAP" }, 403);
        });
      });
    }

    // Apply global security headers
    this.app.use("*", this.security.hardenedHeaders());

    // Auth Routes (Login/Logout)
    this.app.route("/login", createLoginRouter({
      checkLoginRateLimit: this.checkLoginRateLimit.bind(this),
      isTokenValid: (t) => this.isTokenValid(t) as any,
      sessionService: this.services.sessions,
      config: this.services.config
    }));
    this.app.route("/logout", createLogoutRouter({ sessionService: this.services.sessions }));
    this.app.get("/login/", (c) => c.redirect("/login"));

    // 0. AUTH MIDDLEWARE: Protect core resources
    this.app.use("*", (c, next) => {
        const path = c.req.path;
        // Skip auth for static assets and login
        if (path === "/login" || path === "/logout" || path.startsWith("/assets/") || path.startsWith("/vendor/") || path === "/style.css") {
            return next();
        }
        return this.security.auth()(c, next);
    });

    // Unified Logging, Metrics, and Audit Lifecycle
    this.app.use("*", async (c, next) => {
      const start = Date.now();
      const traceId = crypto.randomUUID().slice(0, 8);
      const { method, path } = c.req;
      
      const isHighFrequency = path.includes("/api/metrics") || 
                              path.includes("/api/stats") || 
                              path.includes("/api/compliance/logs") ||
                              path.includes("/api/agent/status");

      if (c.req.header("upgrade") === "websocket") {
        return await next();
      }

      if (!isHighFrequency) {
        await loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:interface:web:api",
          message: `[REQ:${traceId}] ${method} ${path}`
        });
      }

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
      
      if (!isHighFrequency) {
        await loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:interface:web:api",
          message: `[RES:${traceId}] ${method} ${path} -> ${status} (${duration}ms)`
        });
      }

      const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
      const isSuccess = status >= 200 && status < 300;
      const isSensitiveApi = path.startsWith("/api/admin") || path.startsWith("/api/mesh") || path.startsWith("/api/agents");

      if (isMutation && isSuccess && isSensitiveApi) {
          const actor = this.security.getActor(c);
          await this.services.audit.logEvent({
              type: "ADMIN_ACTION",
              message: `${actor.id} executed ${method} on ${path}`,
              actor,
              correlationId: traceId,
              data: { method, path, status, duration }
          });
      }
      
      c.res.headers.set("X-Request-ID", traceId);
      return result;
    });

    this.app.onError((err, c) => {
      const errorMsg = (err as Error).message;
      if (err instanceof AppError) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:interface:web:api",
          message: `[WEB:FAIL] ${errorMsg}`,
          payload: { code: err.statusCode }
        });
        return c.json(err.toJSON(), err.statusCode as any);
      }
      loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:interface:web:api",
        message: `[WEB:CRITICAL] ${errorMsg}`,
        payload: { stack: (err as Error).stack }
      });
      if (!c.req.path.startsWith('/api') && !c.req.path.startsWith('/assets')) {
         const html = `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8" />
                <title>500 // CRITICAL FAULT</title>
                <link rel="stylesheet" href="/style.css" />
              </head>
              <body class="bg-[#050505] text-slate-300 font-sans h-screen flex flex-col items-center justify-center relative overflow-hidden">
                <div class="noise-overlay pointer-events-none opacity-[0.03] absolute inset-0"></div>
                
                <div class="t-panel glass-panel border-t-2 border-danger text-center max-w-lg relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                   <div class="inline-flex p-6 bg-danger/10 border border-danger/20 rounded-full mb-8 shadow-[0_0_20px_rgba(var(--danger-rgb),0.15)] animate-pulse">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-danger"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                   </div>
                   <h1 class="tactical-title text-4xl text-white mb-4">500 // CRITICAL FAULT</h1>
                   <p class="mono-xs text-slate-400 font-bold uppercase tracking-[0.2em] leading-relaxed mb-6">
                      A catastrophic failure occurred within the orchestrator runtime sequence.
                   </p>
                   <div class="bg-black/60 p-4 rounded border border-white/5 mb-10 overflow-x-auto text-left">
                      <span class="mono-xs text-danger font-black">${errorMsg}</span>
                   </div>
                   <a href="/" class="t-btn block w-full py-4 text-center font-black tracking-widest uppercase">
                      Initiate Recovery Reboot
                   </a>
                </div>
              </body>
            </html>
          `;
          return c.html(html, 500);
      }
      return c.json({ error: "Internal Server Error", code: "SERVER_FAULT" }, 500);
    });

    // ── STATIC ASSETS ────────────────────────────────────────────────
    const webRoot = await Deno.stat("./web").then(s => s.isDirectory).catch(() => false) 
      ? "./web" 
      : "./src/orchestrator/interface/web";
    
    this.app.use("/style.css", serveStatic({ path: "./style.css", root: webRoot }));
    this.app.use("/vendor/*", serveStatic({ root: webRoot }));
    this.app.use("/assets/*", serveStatic({ root: webRoot }));
    this.app.use("/components/*", serveStatic({ root: webRoot }));
    this.app.use("/theme.ts", serveStatic({ path: "./theme.ts", root: webRoot }));
    
    const statusAggregator = () => this.getSystemStatus();
    
    this.app.notFound((c) => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>404 // ASSET NOT FOUND</title>
            <link rel="stylesheet" href="/style.css" />
          </head>
          <body class="bg-[#050505] text-slate-300 font-sans h-screen flex flex-col items-center justify-center relative overflow-hidden">
            <div class="noise-overlay pointer-events-none opacity-[0.03] absolute inset-0"></div>
            
            <div class="t-panel glass-panel border-t-2 border-danger text-center max-w-lg relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
               <div class="inline-flex p-6 bg-danger/10 border border-danger/20 rounded-full mb-8 shadow-[0_0_20px_rgba(var(--danger-rgb),0.15)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-danger"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
               </div>
               <h1 class="tactical-title text-4xl text-white mb-4">404 // ASSET NOT FOUND</h1>
               <p class="mono-xs text-slate-400 font-bold uppercase tracking-[0.2em] leading-relaxed mb-10">
                  The requested telemetry endpoint or tactical asset does not exist in the current namespace.
               </p>
               <a href="/" class="t-btn block w-full py-4 text-center font-black tracking-widest uppercase">
                  Return To Overwatch
               </a>
            </div>
            
            <div class="absolute bottom-10 flex gap-4 opacity-40 pointer-events-none">
                <span class="mono-xs font-black text-danger uppercase tracking-[0.4em]">Signal_Lost</span>
                <span class="text-slate-600">/</span>
                <span class="mono-xs font-black text-slate-500 uppercase tracking-widest tabular-nums">ERR_404_NOT_FOUND</span>
            </div>
          </body>
        </html>
      `;
      return c.html(html, 404);
    });

    this.app.route("/api", createApiRouter(this.services, this.security));
    this.app.route("/", createUiRouter(this.services, this.security, statusAggregator));

    this.app.get("/api/ws/events", upgradeWebSocket(async (c) => {
      let role: string | null = null;
      
      const token = c.req.query("token") || c.req.header("Authorization")?.replace("Bearer ", "");
      if (token) {
        role = await this.isTokenValid(token);
      }
      
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
          caller: "orchestrator:interface:web:api:ws:auth",
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
    const { bootstrap } = await import("../../app/bootstrapper.ts");

    const baseStatus = await bootstrap();
    const metrics = getMetricsSnapshot() as any ?? {};
    
    return {
      ...baseStatus,
      ...metrics,
      audit: {
        ...metrics.audit,
        hardwareVerified: metrics.audit?.hardwareVerified || false,
        integrityScore: metrics.node?.integrityScore || 100
      },
      node: {
        ...metrics.node,
        cpu: { load: metrics.node?.cpu?.load || 0 },
        uptime: metrics.node?.uptime || "Active"
      },
      forensics: {
        ...metrics.forensics,
        ebpfActive: metrics.forensics?.ebpfActive || false,
        fimActive: metrics.forensics?.fimActive || false
      },
      mesh: {
        ...metrics.mesh,
        activeNodes: metrics.mesh?.activeNodes || 0
      },
      vpn: {
        ...metrics.vpn,
        active: metrics.vpn?.active || false
      },
      honeypot: {
        ...metrics.honeypot,
        activeDecoys: metrics.honeypot?.activeDecoys || 0,
        totalHits: metrics.honeypot?.totalHits || 0
      },
      platform: this.services.platformInfo,
      plugins: Object.values(await import("@infrastructure/runtime/sidecar_registry.ts").then(m => m.SIDECAR_REGISTRY)).map(s => {
        let isRunning = this.services.command.isRunning(s.name);
        let status = isRunning ? "ACTIVE" : "INACTIVE";

        if (s.name === 'vpn' && this.services.anonymization) {
            status = this.services.anonymization.getTelemetry().status;
        } else if (s.name === 'mesh' && this.services.mesh) {
            status = "ACTIVE";
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
      const result = await this.services.rateLimit.checkLimit(`login:${ip}`, 10, 60000);
      if (!result.allowed) return { allowed: false, retryAfterMs: result.retryAfterMs };
      return { allowed: true };
  }

  async stop(): Promise<void> {
    if (this.server) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.ACTIVITY,
          severity: LogSeverity.INFO,
          caller: "orchestrator:interface:web",
          message: "Stopping web server..."
      });
      await this.server.shutdown();
      this.server = undefined;
    }
  }

  async getStatus() {
    return getMetricsSnapshot() ?? null;
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
          caller: "orchestrator:interface:web",
          message: `SOVEREIGN mTLS Active. Tactical Console: https://localhost:${port}`
      });
      
      this.server = Deno.serve({ 
        port,
        cert: nodeCert.cert,
        key: nodeCert.key
      }, this.app.fetch);
    } else {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:interface:web",
          message: `Orchestrator Engine active (INSECURE HTTP). Tactical Console: http://localhost:${port}`
      });
      this.server = Deno.serve({ port }, this.app.fetch);
    }
  }
}