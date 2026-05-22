import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const id = c.req.param("id");
  try {
    await services.apiKeys.revokeApiKey(id);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
};
