import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { Role } from "@domain/identity/api_keys.ts";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { ActorContext } from "@domain/analysis/audit.ts";

/**
 * Security Middleware Factory
 * Encapsulates all authentication and authorization logic.
 */
export class SecurityMiddleware {
  constructor(private services: ServiceContainer, private masterToken: string) {}

  /**
   * Enforces hardened security headers globally.
   */
  public hardenedHeaders() {
    return async (c: Context, next: Next) => {
      // Generate a fresh nonce for every request
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      c.set("nonce", nonce);

      await next();

      // Apply headers to the final response
      if (c.res) {
        // The console no longer loads webfonts. style.css previously opened
        // with an @import of fonts.googleapis.com, so every dashboard render
        // on a "sovereign", air-gapped appliance made an outbound request to
        // Google carrying the operator's IP, User-Agent and Referer — and on
        // an isolated network the type silently fell back mid-session. The UI
        // is on system font stacks now, so both font origins are dropped.
        //
        // 'unsafe-inline' remains only for style-src: ~95 inline style=""
        // attributes across the islands still set dynamic values. Those are
        // being migrated to data-state attributes (see StatusIndicator.js);
        // once the count reaches zero this can go too.
        c.res.headers.set(
          "Content-Security-Policy",
          `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests;`
        );
        c.res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
        c.res.headers.set("X-Frame-Options", "DENY");
        c.res.headers.set("X-Content-Type-Options", "nosniff");
        c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      }
    };
  }

  /**
   * Helper to extract actor context for audit logging.
   */
  public getActor(c: Context): ActorContext {
    const session = c.get("session");
    const ip = this.getClientIp(c);
    const userAgent = c.req.header("User-Agent");

    if (session) {
      return {
        id: session.name || session.id,
        role: session.role || "viewer",
        ip,
        userAgent
      };
    }

    const role = c.get("role") || "anonymous";
    return {
      id: role === "admin" ? "MASTER_TOKEN" : "ANONYMOUS",
      role,
      ip,
      userAgent
    };
  }

  /**
   * Securely extracts the client IP, preventing spoofing unless from a trusted proxy.
   */
  private getClientIp(c: Context): string {
    const directIp = (c.env as any)?.remoteAddr?.hostname;
    const forwardedFor = c.req.header("X-Forwarded-For");

    if (forwardedFor) {
        const trustedProxies = this.services.config.getEnv("TRUSTED_PROXIES")?.split(",").map(p => p.trim()) || [];
        if (directIp && trustedProxies.includes(directIp)) {
            return forwardedFor.split(",")[0]?.trim() || directIp;
        }
    }

    return directIp || "unknown";
  }

  public auth() {
    return async (c: Context, next: Next) => {
      const path = c.req.path;
      const ip = this.getClientIp(c);

      if ((this.services.threatIntel as import("../../../domain/analysis/curated_intel_service.ts").CuratedIntelService).getBlacklist?.().has(ip)) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:interface:web:middleware:security",
          message: `[SECURITY] REJECTED: Request from blacklisted IP ${ip} to ${path}`
        });
        return c.json({ error: "Access Denied: Malicious IP Detected", code: "BLACK_LIST_REJECT" }, 403);
      }
      
      if (path.startsWith("/api/")) {
        // Relaxed API rate limit (500 req/min) to accommodate dashboard polling and multiple active modules.
        const result = await this.services.rateLimit.checkLimit(ip, 500, 60000);
        if (!result.allowed) {
          return c.json({ 
            error: "Too Many Requests", 
            code: "RATE_LIMIT_EXCEEDED",
            retryAfterMs: result.retryAfterMs 
          }, 429);
        }
      }

      const isAuthRoute = path === "/login" || path === "/login/" || path === "/logout" || path === "/logout/";
      if (isAuthRoute) return next();
      
      const isPublicPath = path === "/style.css" || path.startsWith("/vendor/") || path.startsWith("/assets/") || path.startsWith("/components/");
      const isStaticAsset = /\.(css|js|png|jpg|jpeg|svg|json|ico|woff2?|ttf|otf)$/i.test(path);
      
      if (isStaticAsset && isPublicPath) {
        return next();
      }

      const sessionId = getCookie(c, "session_token");
      if (sessionId) {
        const result = await this.services.sessions.validateSession(sessionId);
        if (result.success && result.data) {
          const session = result.data;
          c.set("role", session.role || "viewer");
          c.set("session", session);
          c.set("csrfToken", session.csrfToken);
          
          if (["POST", "DELETE", "PUT", "PATCH"].includes(c.req.method)) {
            const csrfHeader = c.req.header("X-CT-Token");
            const contentType = c.req.header("Content-Type") || "";
            let csrfBody: string | undefined;
            
            // SOV-04 HARDENING: Strict CSRF enforcement.
            // For JSON/API requests, we REQUIRE the X-CT-Token header.
            // Form-based fallback is ONLY allowed for strictly defined form-encoded types.
            if (!csrfHeader) {
              if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
                const body = await c.req.parseBody().catch(() => ({} as Record<string, string>));
                csrfBody = (body as Record<string, string>).csrfToken as string;
              } else {
                 loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:interface:web:middleware:security",
                    message: `[SECURITY] REJECTED: Missing X-CT-Token for non-form request to ${path}`
                  });
                  return c.json({ error: "Missing Security Token (X-CT-Token required for APIs)", code: "CSRF_MISSING" }, 403);
              }
            }

            const providedToken = csrfHeader || csrfBody;
            if (!providedToken || !session.csrfToken || !(await secureCompare(providedToken, session.csrfToken))) {
              loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:interface:web:middleware:security",
                message: `[SECURITY] CSRF blocked for ${c.req.path}. Method: ${c.req.method}`
              });
              return c.json({ error: "CSRF Validation Failed", code: "CSRF_FAULT" }, 403);
            }
          }
          return next();
        }
      }

      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        if (await secureCompare(token, this.masterToken)) {
          c.set("role", "admin");
          c.set("csrfToken", token); // Use master token as fallback for WS/CSRF
          return next();
        }
      }

      const apiKey = c.req.header("X-Api-Key");
      if (apiKey) {
        const result = await this.services.apiKeys.validateApiKey(apiKey);
        if (result.success && result.data) {
          c.set("role", result.data);
          c.set("csrfToken", apiKey);
          return next();
        }
      }

      if (path.startsWith("/api/")) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return c.redirect("/login");
    };
  }

  public requireRole(...allowedRoles: Role[]) {
    return async (c: Context, next: Next) => {
      const role = c.get("role") as Role;
      if (!role || !allowedRoles.includes(role)) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:interface:web:middleware:security",
          message: `[SECURITY] Access denied for role '${role}' to ${c.req.path}`
        });
        return c.json({ error: "Forbidden: Insufficient Permissions" }, 403);
      }
      return next();
    };
  }

  public meshAuth(meshSecret?: string) {
    return async (c: Context, next: Next) => {
      const signature = c.req.header("X-Mesh-Signature");
      const psk = c.req.header("X-Mesh-Secret");
      
      if (meshSecret && (signature || (psk && await secureCompare(psk, meshSecret)))) {
        c.set("role", "mesh_peer");
        return next();
      }
      return this.auth()(c, next);
    };
  }
}
