import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SignatureService } from "@infrastructure/system/protection/signature_service.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    if (c.req.method === "GET") {
      return c.json(_services.policy.getPolicy());
    }

    const payload = await c.req.json();
    const { policy: newPolicy, signature } = payload;
    if (!newPolicy || typeof newPolicy !== "object") {
      return c.json({ error: "Invalid Policy manifest" }, 400);
    }

    const required = ["version", "mode", "rules"];
    const missing = required.filter((k) => !(k in newPolicy));
    if (missing.length > 0) {
      return c.json({ error: `Policy missing fields: ${missing.join(", ")}` }, 400);
    }

    const currentPolicy = _services.policy.getPolicy();
    if (currentPolicy.publicKey && currentPolicy.strictMode) {
      if (!signature) return c.json({ error: "Strict Mode Active: Policy signature required." }, 401);
      const sigService = new SignatureService();
      const isValid = await sigService.verify(newPolicy, signature, currentPolicy.publicKey);
      if (!isValid) return c.json({ error: "Invalid cryptographic signature." }, 401);
    }

    _services.policy.updatePolicy(newPolicy);
    return c.json({ success: true });
  };
};
