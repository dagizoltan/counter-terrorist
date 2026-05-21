import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    const { source, reason, ttl } = await c.req.json();
    if (!source) return c.json({ error: "Source required" }, 400);
    const { isValidIP, isCriticalInfrastructure } = await import("@infrastructure/system/validation.ts");
    if (isValidIP(source)) {
      if (isCriticalInfrastructure(source)) return c.json({ error: "Cannot isolate critical infrastructure" }, 403);
      await _services.curatedIntel.commitIsolation(source, reason || "MANUAL_OPERATOR_INTERVENTION", ttl || 24);
      return c.json({ success: true, message: `Indicator ${source} committed to active defense lifecycle.` });
    }
    return c.json(await _services.forensicService.isolateSource(source, reason || "MANUAL_OPERATOR_INTERVENTION"));
  };
};
