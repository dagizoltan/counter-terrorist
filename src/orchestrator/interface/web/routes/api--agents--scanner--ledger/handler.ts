import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const ledger = await services.curatedIntel.getLedger({ type: "HASH", minScore: 90, limit: 50 });
  return c.json(ledger);
};
