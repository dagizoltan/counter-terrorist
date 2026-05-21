import { ServiceContainer } from "@core/container.ts";
import { simulateChaosHandler } from "../../api/chaos.ts";

export const handlerFactory = (services: ServiceContainer) => simulateChaosHandler(services.chaos);
