import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  await services.anonymization.rotate();
  return c.json({ success: true, message: "Identity rotation initiated" });
};
