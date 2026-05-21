import { ServiceContainer } from "@core/container.ts";
import { getIdentifiedThreatsHandler } from "../../api/threats.ts";

export const handlerFactory = (services: ServiceContainer) => getIdentifiedThreatsHandler(services);
