import { ServiceContainer } from "@core/container.ts";
import { getSupplyChainStatusHandler } from "../../api/supply_chain.ts";

export const handlerFactory = (services: ServiceContainer) => getSupplyChainStatusHandler(services.supplyChain);
