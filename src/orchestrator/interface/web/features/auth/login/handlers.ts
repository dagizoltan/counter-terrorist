import { Context } from "hono";
import { jsx } from "hono/jsx";

export const loginHandler = async (c: Context) => {
  const { LoginPage } = await import("./page.tsx");
  const nonce = c.get("nonce");
  return c.html(jsx(LoginPage, { nonce }));
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
  if (role) {
    const sessionResult = await deps.sessionService.createSession(role, { name: role === "admin" ? "Master Administrator" : "API User" });
    if (sessionResult.success) {
      c.header("Set-Cookie", `session_token=${sessionResult.data.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${(deps.config.getSessionTTL() || 24) * 3600}`);
      return c.redirect("/dashboard");
    }
  }

  return c.redirect("/login?error=invalid_token");
};

export const logoutHandler = (deps: any) => async (c: Context) => {
  const { getCookie } = await import("hono/helper/cookie/index.ts");
  const sessionId = getCookie(c, "session_token");
  if (sessionId) {
    await deps.sessionService.revokeSession(sessionId);
  }
  c.header("Set-Cookie", "session_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  return c.redirect("/login");
};
