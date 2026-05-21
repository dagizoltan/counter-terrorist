import { ServiceContainer } from "@core/container.ts";
import { scannerSyncHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => scannerSyncHandler(services);
