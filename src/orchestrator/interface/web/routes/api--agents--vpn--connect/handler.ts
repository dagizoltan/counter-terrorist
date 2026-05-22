import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const { interface: iface } = await c.req.json();
  const result = await services.protection.vpn.connect(iface || "wg0");
  return c.json(result);
};
