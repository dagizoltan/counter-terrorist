import { Context, Next } from "hono";
import { getCookie } from "hono/helper/cookie/index.ts";
import { Role } from "../../../services/api_keys.ts";
import { ServiceContainer } from "../../../core/container.ts";
import { loggingService, SyslogSeverity } from "../../../infrastructure/logging.ts";
import { secureCompare } from "../../../infrastructure/validation.ts";

/**
 * Security Middleware Factory
 * Encapsulates all authentication and authorization logic.
 */
export class SecurityMiddleware {
  constructor(private services: ServiceContainer, private masterToken: string) {}

  /**
   * Global Authentication Middleware
   * Handles Session Cookies, Bearer Tokens, and API Keys.
   */
  public auth() {
    return async (c: Context, next: Next) => {
      const path = c.req.path;
      
      // 1. Skip auth for public routes
      if (path === "/login" || path === "/logout" || path.startsWith("/features/") || path.startsWith("/components/")) {
        return next();
      }

      // 2. Session Cookie Auth
      const sessionId = getCookie(c, "session_token");
      if (sessionId) {
        const result = await this.services.sessions.validateSession(sessionId);
        if (result.success && result.data) {
          const session = result.data;
          c.set("role", session.role || "viewer");
          c.set("session", session);
          
          // CSRF enforcement for state-changing methods
          if (["POST", "DELETE", "PUT", "PATCH"].includes(c.req.method)) {
            const csrfHeader = c.req.header("X-CT-Token");
            if (!csrfHeader || !session.csrfToken || !this.timingSafeEqual(csrfHeader, session.csrfToken)) {
              loggingService.log(`[SECURITY] CSRF blocked for ${c.req.path}`, SyslogSeverity.WARNING);
              return c.json({ error: "CSRF Validation Failed" }, 403);
            }
          }
          return next();
        }
      }

      // 3. Bearer Token (Master)
      const authHeader = c.req.header("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        if (await secureCompare(token, this.masterToken)) {
          c.set("role", "admin");
          return next();
        }
      }

      // 4. API Key Header (Scoped)
      const apiKey = c.req.header("X-Api-Key");
      if (apiKey) {
        const result = await this.services.apiKeys.validateApiKey(apiKey);
        if (result.success && result.data) {
          c.set("role", result.data);
          return next();
        }
      }

      // 5. Fallback
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

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}
