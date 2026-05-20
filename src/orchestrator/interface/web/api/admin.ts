import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const listApiKeysHandler = (services: ServiceContainer) => async (c: Context) => {
  return c.json(await services.apiKeys.listApiKeys());
};

export const createApiKeyHandler = (services: ServiceContainer) => async (c: Context) => {
  const { name, role } = await c.req.json();
  if (!name || !["operator", "viewer"].includes(role)) return c.json({ error: "Invalid name or role" }, 400);
  try {
    const data = await services.apiKeys.createApiKey(name, role);
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
};

export const revokeApiKeyHandler = (services: ServiceContainer) => async (c: Context) => {
  const id = c.req.param("id");
  try {
    await services.apiKeys.revokeApiKey(id);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
};
