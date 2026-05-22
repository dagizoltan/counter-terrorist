import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const result = await services.protection.firewall.getStatus();
  return c.json(result);
};
