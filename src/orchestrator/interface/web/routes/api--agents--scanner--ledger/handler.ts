import { ServiceContainer } from "@core/container.ts";
import { scannerLedgerHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => scannerLedgerHandler(services);
