import { ServiceContainer } from "@core/container.ts";
import { getSBOMHandler } from "../../api/supply_chain.ts";

export const handlerFactory = (services: ServiceContainer) => getSBOMHandler(services.supplyChain);
