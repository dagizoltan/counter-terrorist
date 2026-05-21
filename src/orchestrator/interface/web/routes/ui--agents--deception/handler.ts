import { ServiceContainer } from "@core/container.ts";
import { honeypotsHandler } from "../../features/defense/deception/handlers.ts";

export const handlerFactory = (services: ServiceContainer) => honeypotsHandler(services.deceptionGrid);
