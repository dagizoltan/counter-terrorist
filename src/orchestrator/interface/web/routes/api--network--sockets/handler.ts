import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const activeSocketsService = services.activeSocketService;

  if (!activeSocketsService) {
    return c.json({ supported: false, sockets: [] });
  }

  const sockets = await activeSocketsService.listActiveSockets();
  return c.json({
    supported: true,
    sockets,
    count: sockets.length,
  });
};
