import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const { mode } = await c.req.json();
  if (!mode) return c.json({ error: "Mode required" }, 400);
  await services.anonymization.setMode(mode);
  return c.json({ success: true, message: `Stealth mode set to ${mode}` });
};
