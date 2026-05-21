import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    if (_services.processTracker.getTree().length < 5) await _services.processTracker.fullScan();
    return c.json(_services.processTracker.getTree());
  };
};
