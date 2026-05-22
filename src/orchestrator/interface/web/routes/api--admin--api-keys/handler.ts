import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const method = c.req.method;
  if (method === "GET") {
    return c.json(await services.apiKeys.listApiKeys());
  } else if (method === "POST") {
    const { name, role } = await c.req.json();
    if (!name || !["operator", "viewer"].includes(role)) return c.json({ error: "Invalid name or role" }, 400);
    try {
      const data = await services.apiKeys.createApiKey(name, role);
      return c.json(data);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  }
  return c.json({ error: "Method not allowed" }, 405);
};
