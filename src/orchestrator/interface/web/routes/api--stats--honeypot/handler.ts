import { ServiceContainer } from "@core/container.ts";
import { honeypotStatsHandler } from "../../api/stats.ts";

export const handlerFactory = (services: ServiceContainer) => honeypotStatsHandler(services.eventBus);
