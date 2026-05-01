import { Hono } from "hono";
import { ChaosEngine } from "@domain/engine/chaos_engine.ts";

export function createChaosApi(chaosEngine: ChaosEngine, requireRole: any) {
  const api = new Hono();

  api.post("/simulate", requireRole("admin"), async (c) => {
    const { vector, target } = await c.req.json();
    if (vector === "brute-force") await chaosEngine.simulateBruteForce(target);
    if (vector === "canary") await chaosEngine.simulateCanaryTrigger(target);
    if (vector === "malware") await chaosEngine.simulateMalwareExecution(target);
    return c.json({ success: true, message: `Simulation '${vector}' triggered.` });
  });

  return api;
}
