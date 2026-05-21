import { ServiceContainer } from "@core/container.ts";
import { updateIncidentStatusHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => updateIncidentStatusHandler(services);
