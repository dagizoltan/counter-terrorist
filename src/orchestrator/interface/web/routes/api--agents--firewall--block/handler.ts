import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { isValidIP, isCriticalInfrastructure } from "@infrastructure/system/validation.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const payload = await c.req.json();
  if (!payload.ip || !isValidIP(payload.ip)) return c.json({ error: "Invalid IP address" }, 400);
  if (isCriticalInfrastructure(payload.ip)) return c.json({ error: "Cannot block critical infrastructure" }, 403);

  const result = await services.protection.firewall.blockIp(payload.ip);
  return c.json(result);
};
