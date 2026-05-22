import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => (c: Context) => {
  const meshNodes = services.mesh.getNodes();
  return c.json({
    local: Deno.hostname(),
    peers: meshNodes.map(node => ({
      id: node.id || node.hostname,
      hostname: node.hostname,
      address: node.address,
      status: Date.now() - node.lastSeen < 60000 ? "ACTIVE" : "INACTIVE",
      verified: node.verified,
    }))
  });
};
