import { ServiceContainer } from "@core/container.ts";
import { honeypotsHandler } from "./handlers.ts";

export const handlerFactory = (services: ServiceContainer) => honeypotsHandler(services.deceptionGrid);
