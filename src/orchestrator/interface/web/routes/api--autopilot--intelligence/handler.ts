import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    return c.json(_services.autopilot.getTacticalIntelligence());
  };
};
