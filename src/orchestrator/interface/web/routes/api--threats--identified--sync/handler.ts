import { ServiceContainer } from "@core/container.ts";
import { syncThreatsHandler } from "../../api/threats.ts";

export const handlerFactory = (services: ServiceContainer) => syncThreatsHandler(services);
