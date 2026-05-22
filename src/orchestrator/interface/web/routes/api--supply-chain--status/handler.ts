import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  return c.json({
    score: services.supplyChain.getHealthScore(),
    vulnerableCount: services.supplyChain.getVexReport().length
  });
};
