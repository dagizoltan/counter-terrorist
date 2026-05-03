import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { Login } from "./page.tsx";
import { setCookie, getCookie, deleteCookie } from "hono/helper/cookie/index.ts";
import { loggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";
import { Role } from "@domain/identity/api_keys.ts";

export interface LoginRouterDependencies {
  checkLoginRateLimit: (ip: string) => { allowed: boolean; retryAfterMs?: number };
  isTokenValid: (token: string | undefined) => Promise<Role | null>;
  sessionService: any;
  config: any;
}

export function createLoginRouter(deps: LoginRouterDependencies) {
  const router = new Hono();

  router.get("/", (c: Context) => {
    return c.html(<Login />);
  });

  router.post("/", async (c: Context) => {
    const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      || c.req.header("x-real-ip")
      || "unknown";
    const contentType = c.req.header("Content-Type");

    console.log(`[AUTH:HANDLER] Received login request from ${clientIp}, content-type: ${contentType}`);

    const rateCheck = deps.checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs || 60_000) / 1000);
      loggingService.log(
        `[AUTH] Login rate limit exceeded for IP ${clientIp}. Retry after ${retryAfterSec}s.`,
        SyslogSeverity.WARNING
      );
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: "Too many login attempts. Please try again later." }, 429);
    }

    let token: string | undefined;
    if (contentType && contentType.includes("application/json")) {
      const body = await c.req.json();
      token = body.token;
    } else {
      const body = await c.req.parseBody();
      token = body.password as string;
    }

    console.log(`[AUTH:HANDLER] Extracted token length: ${token?.length || 0}`);
    const role = await deps.isTokenValid(token);
    if (token && role) {
      const result = await deps.sessionService.createSession(role);
      
      if (!result.success) {
        return c.json({ error: "Failed to create session" }, 500);
      }

      const { sessionId, csrfToken } = result.data;

      const secureCookie = deps.config.getBoolean("COOKIE_SECURE", true);
      const isLocal = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost" || clientIp === "unknown";
      const shouldBeSecure = secureCookie && !isLocal;

      console.log(`[AUTH:HANDLER] Setting session cookie: ${sessionId.slice(0, 8)}… (secure: ${shouldBeSecure}, Strict)`);
      setCookie(c, "session_token", sessionId, {
        httpOnly: true,
        secure: shouldBeSecure,
        sameSite: "Strict",
        maxAge: deps.config.getNumber("SESSION_TTL_HOURS", 24) * 3600,
      });

      if (contentType && contentType.includes("application/json")) {
          return c.json({ success: true, csrfToken });
      }

      setCookie(c, "csrf_token", csrfToken, {
        httpOnly: false,
        secure: shouldBeSecure,
        sameSite: "Strict",
        maxAge: deps.config.getNumber("SESSION_TTL_HOURS", 24) * 3600,
      });

      return c.redirect("/");
    }

    loggingService.log(
      `[AUTH] Failed login attempt from IP ${clientIp}`,
      SyslogSeverity.NOTICE
    );

    if (contentType && contentType.includes("application/json")) {
        return c.json({ error: "Invalid token" }, 401);
    }
    return c.html(<Login error="Invalid token" />);
  });

  return router;
}

export function createLogoutRouter(deps: { sessionService: any }) {
  const router = new Hono();
  router.post("/", async (c: Context) => {
    const sessionId = getCookie(c, "session_token");
    if (sessionId) {
      await deps.sessionService.revokeSession(sessionId);
    }
    deleteCookie(c, "session_token");
    deleteCookie(c, "csrf_token");
    return c.redirect("/login");
  });
  return router;
}
