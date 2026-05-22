import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const result = await services.protection.antivirus.syncSignatures();
  return c.json(result.success ? result.data : { success: false, error: (result as any).error?.message || "Sync failed" });
};
