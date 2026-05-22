import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const bundle = await services.forensicService.generateEvidenceBundle();
  return c.json({ success: true, bundleId: bundle.id });
};
