import { ServiceContainer } from "@core/container.ts";
import { getIncidentsHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => getIncidentsHandler(services);
