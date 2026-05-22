import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { isValidIP } from "@infrastructure/system/validation.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const payload = await c.req.json();
  if (!payload.ip || !isValidIP(payload.ip)) return c.json({ error: "Invalid IP address" }, 400);

  const result = await services.protection.firewall.unblockIp(payload.ip);
  return c.json(result);
};
