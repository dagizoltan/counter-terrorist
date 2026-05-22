import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const limit = Number(c.req.query("limit")) || 50;
  const events = await services.audit.getRecentEvents(limit);
  return c.json(events);
};
