import { Context, Next } from "hono";
import { getCookie } from "hono/helper/cookie/index.ts";
import { Role } from "@domain/identity/api_keys.ts";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";

/**
 * Security Middleware Factory
 * Encapsulates all authentication and authorization logic.
 */
export class SecurityMiddleware {
  private apiRateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(private services: ServiceContainer, private masterToken: string) {}

  public auth() {
    return async (c: Context, next: Next) => {
      const path = c.req.path;
      const ip = c.req.header("X-Forwarded-For") || "unknown";

      // 0. Threat Intel Blacklist Check (Software Firewall Fallback)
      if (this.services.threatIntel.getBlacklist().has(ip)) {
        loggingService.log(`[SECURITY] REJECTED: Request from blacklisted IP ${ip} to ${path}`, SyslogSeverity.CRITICAL);
        return c.json({ error: "Access Denied: Malicious IP Detected", code: "BLACK_LIST_REJECT" }, 403);
      }
      
      // 1. Rate Limiting for API routes
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

        if (limit.count > 100) { // 100 req/min
           loggingService.log(`[SECURITY] Rate limit exceeded for IP: ${ip}`, SyslogSeverity.WARNING);
           return c.json({ error: "Too Many Requests", code: "RATE_LIMIT_EXCEEDED" }, 429);
        }
      }

      // 2. Skip auth for public routes and essential static assets
      if (path === "/login" || path === "/logout") return next();
      
      if (path.startsWith("/features/") || path.startsWith("/components/")) {
        const isStaticAsset = /\.(css|js|png|jpg|jpeg|svg|json|ico)$/.test(path);
        if (isStaticAsset) return next();
      }

      // 3. Session Cookie Auth
      const sessionId = getCookie(c, "session_token");
      if (sessionId) {
        const session = await this.services.sessions.validateSession(sessionId);
        if (session) {
          c.set("role", session.role || "viewer");
          c.set("session", session);
          c.set("csrfToken", session.csrfToken);
          
          // CSRF enforcement for state-changing methods
          if (["POST", "DELETE", "PUT", "PATCH"].includes(c.req.method)) {
            const csrfHeader = c.req.header("X-CT-Token");
            if (!csrfHeader || !session.csrfToken || !(await secureCompare(csrfHeader, session.csrfToken))) {
              loggingService.log(`[SECURITY] CSRF blocked for ${c.req.path}. Expected: ${session.csrfToken?.slice(0, 8)}, Got: ${csrfHeader?.slice(0, 8)}`, SyslogSeverity.WARNING);
              return c.json({ error: "CSRF Validation Failed" }, 403);
            }
          }
          return next();
        } else {
          loggingService.log(`[SECURITY] Invalid or expired session ID: ${sessionId.slice(0, 8)}…`, SyslogSeverity.NOTICE);
        }
      } else {
        if (!path.startsWith("/api/")) {
           // Silently ignore missing cookies for public assets, but log for pages
           if (path === "/" || path.endsWith(".html")) {
             loggingService.log(`[SECURITY] No session cookie found for page: ${path}`, SyslogSeverity.NOTICE);
           }
        }
      }

      // 4. Bearer Token (Master)
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        if (await secureCompare(token, this.masterToken)) {
          c.set("role", "admin");
          return next();
        }
      }

      // 5. API Key Header (Scoped)
      const apiKey = c.req.header("X-Api-Key");
      if (apiKey) {
        const role = await this.services.apiKeys.validateApiKey(apiKey);
        if (role) {
          c.set("role", role);
          return next();
        }
      }

      // 6. Query Parameter Token (Helper for WebSockets/Handshakes)
      const queryToken = c.req.query("token");
      if (queryToken) {
          if (await secureCompare(queryToken, this.masterToken)) {
              c.set("role", "admin");
              return next();
          }
          const role = await this.services.apiKeys.validateApiKey(queryToken);
          if (role) {
              c.set("role", role);
              return next();
          }
      }

      // 7. Fallback
      if (path.startsWith("/api/")) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      return c.redirect("/login");
    };
  }

  /**
   * Role-Based Access Control Middleware
   */
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

  /**
   * Mesh-Specific PSK Authentication
   */
  public meshAuth(meshSecret?: string) {
    return async (c: Context, next: Next) => {
      const psk = c.req.header("X-Mesh-Secret");
      if (meshSecret && psk && await secureCompare(psk, meshSecret)) {
        return next();
      }
      
      // Fall through to standard auth (allows admins to call mesh APIs)
      return this.auth()(c, next);
    };
  }

}
