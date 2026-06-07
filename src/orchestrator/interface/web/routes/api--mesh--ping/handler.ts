import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  // SEC-05: Authenticated Probing - Challenge/Response
  // Verify that the prober has the Mesh Secret before revealing Node ID.
  const ts = c.req.query("ts");
  const sig = c.req.query("sig");
  const address = (c.env as any)?.remoteAddr?.hostname || "unknown";

  if (ts && sig) {
      const isValid = await services.mesh.verifySignature({ target: address, ts: parseInt(ts) }, sig);
      if (!isValid) {
          return c.json({ error: "Unauthorized Probe" }, 401);
      }
  } else if (Deno.env.get("ENVIRONMENT") === "production") {
      // In production, anonymous pings are strictly forbidden to prevent network reconnaissance.
      return c.json({ error: "Authentication Required" }, 401);
  }

  const payload = { success: true, nodeId: services.mesh.getNodeId(), timestamp: Date.now() };
  const signature = await services.mesh.signPayload(payload);
  c.header("X-Mesh-Signature", signature);
  return c.json(payload);
};
