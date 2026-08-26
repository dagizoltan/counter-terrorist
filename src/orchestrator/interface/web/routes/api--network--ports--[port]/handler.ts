import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * Open or close one port at the perimeter.
 *
 * allowPort/denyPort reach the sentinel sidecar with a ufw fallback and have
 * always worked — the only caller was the honeypot service, so the capability
 * was reachable only by arming a decoy. This exposes it directly.
 *
 * Admin only, and the ports the orchestrator itself needs are refused: closing
 * the console's own listener from the console is a foot-gun with no recovery
 * path short of shell access.
 */
const PROTOCOLS = new Set(["tcp", "udp"]);

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const raw = c.req.param("port");
  const port = Number(raw);

  if (!/^\d+$/.test(raw ?? "") || !Number.isInteger(port) || port < 1 || port > 65535) {
    return c.json({ success: false, error: "`port` must be an integer in 1-65535" }, 400);
  }

  let body: { action?: unknown; protocol?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Body must be JSON" }, 400);
  }

  if (body.action !== "allow" && body.action !== "deny") {
    return c.json({ success: false, error: "`action` must be 'allow' or 'deny'" }, 400);
  }

  const protocol = body.protocol === undefined ? "tcp" : body.protocol;
  if (typeof protocol !== "string" || !PROTOCOLS.has(protocol)) {
    return c.json({ success: false, error: "`protocol` must be 'tcp' or 'udp'" }, 400);
  }

  const selfPort = Number(services.config.getEnv("PORT") ?? 8000);
  if (body.action === "deny" && port === selfPort) {
    return c.json({
      success: false,
      error: `Refusing to close port ${port}: the console is served on it`,
    }, 403);
  }

  const result = body.action === "allow"
    ? await services.protection.firewall.allowPort(port, protocol as "tcp" | "udp")
    : await services.protection.firewall.denyPort(port, protocol as "tcp" | "udp");

  if (!result.success) {
    return c.json({ success: false, error: result.stderr || `Failed to ${body.action} port ${port}` }, 500);
  }

  return c.json({ port, protocol, action: body.action });
};
