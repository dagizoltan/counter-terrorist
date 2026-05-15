import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { Login } from "./page.tsx";
import { setCookie, getCookie, deleteCookie } from "hono/helper/cookie/index.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { Role } from "@domain/identity/api_keys.ts";

export interface LoginRouterDependencies {
  checkLoginRateLimit: (ip: string) => Promise<{ allowed: boolean; retryAfterMs?: number }>;
  isTokenValid: (token: string | undefined) => Promise<Role | null>;
  sessionService: any;
  config: any;
}

export function createLoginRouter(deps: LoginRouterDependencies) {
  const router = new Hono();

  router.get("/", (c: Context) => {
    return c.html(<Login nonce={c.get("nonce")} />);
  });

  router.post("/", async (c: Context) => {
    const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      || c.req.header("x-real-ip")
      || (c.env as any)?.remoteAddr?.hostname
      || "unknown";
    const contentType = c.req.header("Content-Type");

    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:interface:web:features:auth:handler",
        message: `Received login request from ${clientIp}, content-type: ${contentType}`
    });

    const rateCheck = await deps.checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs || 60_000) / 1000);
      const errorMsg = `Too many login attempts. Please try again later (retry in ${retryAfterSec}s).`;
      
      loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:interface:web:features:auth",
        message: `Login rate limit exceeded for IP ${clientIp}. Retry after ${retryAfterSec}s.`
      });
      
      c.header("Retry-After", String(retryAfterSec));
      
      if (contentType && contentType.includes("application/json")) {
        return c.json({ error: errorMsg }, 429);
      }
      return c.html(<Login error={errorMsg} nonce={c.get("nonce")} />, 429);
    }

    let token: string | undefined;
    if (contentType && contentType.includes("application/json")) {
      const body = await c.req.json();
      token = body.token;
    } else {
      const body = await c.req.parseBody();
      token = body.password as string;
    }

    const role = await deps.isTokenValid(token);
    if (token && role) {
      // SessionService returns Session directly, and expects (userId, role)
      const session = await deps.sessionService.createSession(role, role);
      
      if (!session) {
        return c.json({ error: "Failed to create session" }, 500);
      }

      const { id: sessionId, csrfToken } = session;

      const secureCookie = deps.config.getBoolean("COOKIE_SECURE", true);
      const isHttps = c.req.url.startsWith("https:");
      const shouldBeSecure = secureCookie && isHttps;

      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:interface:web:features:auth:handler",
          message: `Setting session cookie: ${sessionId.slice(0, 8)}… (secure: ${shouldBeSecure}, Strict)`
      });
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

    loggingService.log({
      timestamp: new Date().toISOString(),
      type: LogType.AUDIT,
      severity: LogSeverity.WARNING,
      caller: "orchestrator:interface:web:features:auth",
      message: `Failed login attempt from IP ${clientIp}`
    });

    if (contentType && contentType.includes("application/json")) {
        return c.json({ error: "Invalid token" }, 401);
    }
    return c.html(<Login error="Invalid token" nonce={c.get("nonce")} />);
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
