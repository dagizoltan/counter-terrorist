import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const id = c.req.param("id");
  const success = await services.notifications.deleteWebhook(id);
  return c.json({ success });
};
