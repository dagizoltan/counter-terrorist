import { ServiceContainer } from "@core/container.ts";
import { scannerScanHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => scannerScanHandler(services);
