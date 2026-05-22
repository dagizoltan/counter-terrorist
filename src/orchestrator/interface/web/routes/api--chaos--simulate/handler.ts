import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const { vector, target } = await c.req.json();
  if (vector === "brute-force") await services.chaos.simulateBruteForce(target);
  if (vector === "canary") await services.chaos.simulateCanaryTrigger(target);
  if (vector === "malware") await services.chaos.simulateMalwareExecution(target);
  return c.json({ success: true, message: `Simulation '${vector}' triggered.` });
};
