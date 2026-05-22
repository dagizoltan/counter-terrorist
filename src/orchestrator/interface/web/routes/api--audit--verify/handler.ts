import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const limit = Number(c.req.query("limit")) || 1000;
  try {
    const result = await services.audit.verifyChain(limit);
    const status = result.valid ? 200 : 409;
    return c.json(result, status);
  } catch (e) {
    return c.json({ error: "Failed to verify chain", details: (e as Error).message }, 500);
  }
};
