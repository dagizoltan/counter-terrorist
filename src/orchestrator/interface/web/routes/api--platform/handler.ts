import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    return c.json({ name: _services.platformInfo.name, version: _services.platformInfo.version, tag: _services.platformInfo.tag });
  };
};
