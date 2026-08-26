import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { isValidIP } from "@infrastructure/system/validation.ts";

/**
 * Run the Breaker protocol against one source address.
 *
 * HoneypotService.sabotageSession() injects latency, jitter and fabricated
 * errors into an attacker's session to slow them down and poison what they
 * learn. It already fires automatically on every honeypot hit — onWebTrigger
 * and the PortAccess fallback both call it — but there was no way to aim it
 * by hand at an address the operator is watching.
 *
 * Same validation posture as the firewall routes: reject anything that is not
 * an IP before the command reaches the sidecar.
 */
const LEVELS = new Set(["HIGH", "CRITICAL"]);

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const honeypot = services.deceptionGrid?.honeypot;
  if (!honeypot) {
    return c.json({ success: false, error: "Deception grid is not running" }, 503);
  }

  let body: { ip?: unknown; level?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Body must be JSON" }, 400);
  }

  if (typeof body.ip !== "string" || !isValidIP(body.ip)) {
    return c.json({ success: false, error: "`ip` must be a valid IP address" }, 400);
  }

  const level = body.level === undefined ? "HIGH" : body.level;
  if (typeof level !== "string" || !LEVELS.has(level)) {
    return c.json({ success: false, error: "`level` must be HIGH or CRITICAL" }, 400);
  }

  const result = await honeypot.sabotageSession(body.ip, level);
  if (!result.success) {
    return c.json({ success: false, error: result.error.message }, 500);
  }

  return c.json({ ip: body.ip, level, engaged: true });
};
