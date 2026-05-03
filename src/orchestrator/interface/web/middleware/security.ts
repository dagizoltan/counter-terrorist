import { Context, Next } from "hono";
import { getCookie } from "hono/helper/cookie/index.ts";
import { Role } from "@domain/identity/api_keys.ts";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { ActorContext } from "@domain/analysis/audit.ts";

/**
 * Security Middleware Factory
 * Encapsulates all authentication and authorization logic.
 */
export class SecurityMiddleware {
  private apiRateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(private services: ServiceContainer, private masterToken: string) {}

  /**
   * Enforces hardened security headers globally.
   */
  public hardenedHeaders() {
    return async (c: Context, next: Next) => {
      c.res.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
      );
      c.res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
      c.res.headers.set("X-Frame-Options", "DENY");
      c.res.headers.set("X-Content-Type-Options", "nosniff");
      c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      c.res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
      await next();
    };
  }

  /**
   * Helper to extract actor context for audit logging.
   */
  public getActor(c: Context): ActorContext {
    const session = c.get("session");
    const ip = c.req.header("X-Forwarded-For") || "unknown";
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

  public auth() {
    return async (c: Context, next: Next) => {
      const path = c.req.path;
      const ip = c.req.header("X-Forwarded-For") || "unknown";

      if (this.services.threatIntel.getBlacklist().has(ip)) {
        loggingService.log(`[SECURITY] REJECTED: Request from blacklisted IP ${ip} to ${path}`, SyslogSeverity.CRITICAL);
        return c.json({ error: "Access Denied: Malicious IP Detected", code: "BLACK_LIST_REJECT" }, 403);
      }
      
      if (path.startsWith("/api/")) {
        const now = Date.now();
        const limit = this.apiRateLimits.get(ip) || { count: 0, resetAt: now + 60000 };
        
        if (now > limit.resetAt) {
          limit.count = 1;
          limit.resetAt = now + 60000;
        } else {
          limit.count++;
        }
        this.apiRateLimits.set(ip, limit);

        if (limit.count > 100) {
           loggingService.log(`[SECURITY] Rate limit exceeded for IP: ${ip}`, SyslogSeverity.WARNING);
           return c.json({ error: "Too Many Requests", code: "RATE_LIMIT_EXCEEDED" }, 429);
        }
      }

      const isAuthRoute = path === "/login" || path === "/login/" || path === "/logout" || path === "/logout/";
      if (isAuthRoute) return next();
      
      if (path.startsWith("/features/") || path.startsWith("/components/")) {
        const isStaticAsset = /\.(css|js|png|jpg|jpeg|svg|json|ico)$/.test(path);
        if (isStaticAsset) return next();
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
            if (!csrfHeader || !session.csrfToken || !(await secureCompare(csrfHeader, session.csrfToken))) {
              loggingService.log(`[SECURITY] CSRF blocked for ${c.req.path}`, SyslogSeverity.WARNING);
              return c.json({ error: "CSRF Validation Failed" }, 403);
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
          return next();
        }
      }

      const apiKey = c.req.header("X-Api-Key");
      if (apiKey) {
        const result = await this.services.apiKeys.validateApiKey(apiKey);
        if (result.success && result.data) {
          c.set("role", result.data);
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
        loggingService.log(`[SECURITY] Access denied for role '${role}' to ${c.req.path}`, SyslogSeverity.WARNING);
        return c.json({ error: "Forbidden: Insufficient Permissions" }, 403);
      }
      return next();
    };
  }

  public meshAuth(meshSecret?: string) {
    return async (c: Context, next: Next) => {
      const psk = c.req.header("X-Mesh-Secret");
      if (meshSecret && psk && await secureCompare(psk, meshSecret)) {
        return next();
      }
      return this.auth()(c, next);
    };
  }
}
