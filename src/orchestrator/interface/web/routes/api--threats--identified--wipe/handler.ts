import { ServiceContainer } from "@core/container.ts";
import { wipeThreatsHandler } from "../../api/threats.ts";

export const handlerFactory = (services: ServiceContainer) => wipeThreatsHandler(services);
