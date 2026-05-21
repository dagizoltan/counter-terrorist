import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { getWebhooksHandler, addWebhookHandler } from "../../api/notifications.ts";

export const handlerFactory = (services: ServiceContainer) => {
  const handlers = {
    getWebhooksHandler: getWebhooksHandler(services.notifications),
    addWebhookHandler: addWebhookHandler(services.notifications),
  };

  return async (c: Context) => {
    if (c.req.method === "GET") return handlers.getWebhooksHandler(c);
    if (c.req.method === "POST") return handlers.addWebhookHandler(c);
    return c.text("Method not allowed", 405);
  };
};
