import { ServiceContainer } from "@core/container.ts";
import { getThreatSignalsHandler } from "../../api/threats.ts";

export const handlerFactory = (services: ServiceContainer) => getThreatSignalsHandler(services);
