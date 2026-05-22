import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const logs = await services.networkLogs.getRecent(50);
  return c.json(logs);
};
