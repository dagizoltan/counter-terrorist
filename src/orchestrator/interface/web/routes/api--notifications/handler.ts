import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const method = c.req.method;
  if (method === "GET") {
    return c.json(services.notifications.getWebhooks());
  } else if (method === "POST") {
    const config = await c.req.json();
    const result = await services.notifications.addWebhook(config);
    if ("error" in result) {
      return c.json({ success: false, error: result.error }, 400);
    }
    return c.json(result, 201);
  }
  return c.json({ error: "Method not allowed" }, 405);
};
