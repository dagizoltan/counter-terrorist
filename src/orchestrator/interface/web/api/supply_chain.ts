import { Hono } from "hono";
import { SupplyChainService } from "@domain/analysis/supply_chain.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

export function createSupplyChainApi(supplyChain: SupplyChainService, security: SecurityMiddleware) {
  const api = new Hono();

  api.get("/sbom", security.requireRole("admin", "operator", "viewer"), async (c) => {
    return c.json(supplyChain.getSBOM());
  });

  api.get("/status", security.requireRole("admin", "operator", "viewer"), async (c) => {
    return c.json({ 
      score: supplyChain.getHealthScore(), 
      vulnerableCount: supplyChain.getVexReport().length 
    });
  });

  return api;
}
