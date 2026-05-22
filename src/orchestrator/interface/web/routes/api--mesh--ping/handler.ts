import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const payload = { success: true, nodeId: services.mesh.getNodeId(), timestamp: Date.now() };
  const signature = await services.mesh.signPayload(payload);
  c.header("X-Mesh-Signature", signature);
  return c.json(payload);
};
