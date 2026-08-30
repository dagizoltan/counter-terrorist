import { Context } from "hono";
import { jsx } from "hono/jsx";
import { resolveClientIp } from "../../middleware/security.ts";

export const loginHandler = async (c: Context) => {
  const { Login } = await import("./page.tsx");
  const nonce = c.get("nonce");
  return c.html(jsx(Login, { nonce }) as any);
};

export const postLoginHandler = (deps: any) => async (c: Context) => {
  // Keyed on the trusted-proxy-resolved peer, not on raw X-Forwarded-For. Trusting the
  // header here let anyone reset the 10-per-minute login limiter on every attempt just
  // by incrementing it, which left the token brute-forceable at full request rate.
  const ip = resolveClientIp(c, deps.config.getEnv("TRUSTED_PROXIES") || "");
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
  // The console is served over TLS unless DISABLE_HTTPS is set, so the session cookie
  // is marked Secure: without it the browser will attach it to any plaintext request to
  // the same host, which is exactly what a downgrade attempt is looking for.
  c.header("Set-Cookie", `session_token=${session.id}; Path=/; HttpOnly; SameSite=Strict; ${cookieSecurityAttrs(deps)}Max-Age=${ttlHours * 3600}`);
  return c.redirect("/dashboard");
};

/** `Secure; ` unless the node is explicitly configured to serve plain HTTP. */
function cookieSecurityAttrs(deps: { config: { getEnv: (k: string) => string | undefined } }): string {
  return deps.config.getEnv("DISABLE_HTTPS") === "true" ? "" : "Secure; ";
}

export const logoutHandler = (deps: any) => async (c: Context) => {
  const { getCookie } = await import("hono/cookie");
  const sessionId = getCookie(c, "session_token");
  if (sessionId) {
    await deps.sessionService.revokeSession(sessionId);
  }
  c.header("Set-Cookie", `session_token=; Path=/; HttpOnly; SameSite=Strict; ${cookieSecurityAttrs(deps)}Max-Age=0`);
  return c.redirect("/login");
};
