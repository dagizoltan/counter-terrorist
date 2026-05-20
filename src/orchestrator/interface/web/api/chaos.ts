import { Context } from "hono";
import { ChaosEngine } from "@domain/orchestration/chaos_engine.ts";

export const simulateChaosHandler = (chaosEngine: ChaosEngine) => async (c: Context) => {
  const { vector, target } = await c.req.json();
  if (vector === "brute-force") await chaosEngine.simulateBruteForce(target);
  if (vector === "canary") await chaosEngine.simulateCanaryTrigger(target);
  if (vector === "malware") await chaosEngine.simulateMalwareExecution(target);
  return c.json({ success: true, message: `Simulation '${vector}' triggered.` });
};
