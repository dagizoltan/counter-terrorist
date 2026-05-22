import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  await services.mesh.resyncNodes();
  return c.json({ success: true, message: "Mesh synchronization broadcasted" });
};
