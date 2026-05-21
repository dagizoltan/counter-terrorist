import { ServiceContainer } from "@core/container.ts";
import { getThreatStatsHandler } from "../../api/threats.ts";

export const handlerFactory = (services: ServiceContainer) => getThreatStatsHandler(services);
