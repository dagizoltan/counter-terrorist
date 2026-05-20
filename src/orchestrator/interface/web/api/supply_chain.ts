import { Context } from "hono";
import { SupplyChainService } from "@domain/analysis/supply_chain.ts";

export const getSBOMHandler = (supplyChain: SupplyChainService) => async (c: Context) => {
  return c.json(supplyChain.getSBOM());
};

export const getSupplyChainStatusHandler = (supplyChain: SupplyChainService) => async (c: Context) => {
  return c.json({
    score: supplyChain.getHealthScore(),
    vulnerableCount: supplyChain.getVexReport().length
  });
};
