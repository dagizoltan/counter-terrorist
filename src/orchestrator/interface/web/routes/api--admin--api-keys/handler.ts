import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { listApiKeysHandler, createApiKeyHandler } from "../../api/admin.ts";

export const handlerFactory = (services: ServiceContainer) => {
  const handlers = {
    listApiKeysHandler: listApiKeysHandler(services),
    createApiKeyHandler: createApiKeyHandler(services),
  };

  return async (c: Context) => {
    switch (c.req.method) {
      case "GET":
        return handlers.listApiKeysHandler(c);
      case "POST":
        return handlers.createApiKeyHandler(c);
      default:
        return c.text("Method not allowed", 405);
    }
  };
};
