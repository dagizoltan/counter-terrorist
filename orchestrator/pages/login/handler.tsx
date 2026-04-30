import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { Login } from "./page.tsx";
import { setCookie, getCookie, deleteCookie } from "hono/helper/cookie/index.ts";
import { loggingService, SyslogSeverity } from "../../infrastructure/logging.ts";

export interface LoginRouterDependencies {
  checkLoginRateLimit: (ip: string) => { allowed: boolean; retryAfterMs?: number };
  isTokenValid: (token: string) => Promise<boolean>;
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
    const contentType = c.req.header("Content-Type");
    if (contentType && contentType.includes("application/json")) {
      const body = await c.req.json();
      token = body.token;
    } else {
      const body = await c.req.parseBody();
      token = body.password as string;
    }

    if (token && (await deps.isTokenValid(token))) {
      const { sessionId, csrfToken } = await deps.sessionService.createSession();

      const secureCookie = deps.config.getBoolean("COOKIE_SECURE", true);
      setCookie(c, "session_token", sessionId, {
        httpOnly: true,
        secure: secureCookie,
        sameSite: "Strict",
        maxAge: 86400, // 24 hours
      });

      if (contentType && contentType.includes("application/json")) {
          return c.json({ success: true, csrfToken });
      }

      setCookie(c, "csrf_token", csrfToken, {
        httpOnly: false,
        secure: secureCookie,
        sameSite: "Strict",
        maxAge: 86400,
      });

      return c.redirect("/");
    }

    loggingService.log(
      `[AUTH] Failed login attempt from IP ${clientIp}`,
      SyslogSeverity.NOTICE
    );
    return c.json({ error: "Invalid token" }, 401);
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
