import { Context } from "hono";
import { jsx } from "hono/jsx";

export const loginHandler = async (c: Context) => {
  const { Login } = await import("./page.tsx");
  const nonce = c.get("nonce");
  return c.html(jsx(Login, { nonce }) as any);
};

export const postLoginHandler = (deps: any) => async (c: Context) => {
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "unknown";
  const rateLimit = await deps.checkLoginRateLimit(ip);
  if (!rateLimit.allowed) {
    return c.json({ error: "Too many login attempts", retryAfterMs: rateLimit.retryAfterMs }, 429);
  }

  const body = await c.req.parseBody();
  const token = body.token as string;

  const role = await deps.isTokenValid(token);
  if (!role) return c.redirect("/login?error=invalid_token");

  // createSession(userId, role, metadata) resolves to the Session itself, not a
  // Result envelope. Reading `.success` off it was always undefined, so every
  // valid login fell through to the invalid-token redirect below.
  const session = await deps.sessionService.createSession(
    role,
    role,
    { name: role === "admin" ? "Master Administrator" : "API User" }
  ).catch(() => null);

  if (!session?.id) {
    // Distinct from a bad token: the credential was good, persisting the session failed.
    return c.redirect("/login?error=session_failed");
  }

  // ConfigurationPort has no getSessionTTL; SESSION_TTL_HOURS is a validated schema key.
  const ttlHours = deps.config.getNumber("SESSION_TTL_HOURS", 24);
  c.header("Set-Cookie", `session_token=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttlHours * 3600}`);
  return c.redirect("/dashboard");
};

export const logoutHandler = (deps: any) => async (c: Context) => {
  const { getCookie } = await import("hono/cookie");
  const sessionId = getCookie(c, "session_token");
  if (sessionId) {
    await deps.sessionService.revokeSession(sessionId);
  }
  c.header("Set-Cookie", "session_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  return c.redirect("/login");
};
