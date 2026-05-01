import { Hono } from "hono";
import { SupplyChainService } from "@domain/analysis/supply_chain.ts";

export function createSupplyChainApi(supplyChain: SupplyChainService) {
  const api = new Hono();

  api.get("/sbom", async (c) => {
    return c.json(supplyChain.getSBOM());
  });

  api.get("/status", async (c) => {
    return c.json({ 
      score: supplyChain.getHealthScore(), 
      vulnerableCount: supplyChain.getVexReport().length 
    });
  });

  return api;
}
