import { ServiceContainer } from "@core/container.ts";
import { getAuditEventsHandler } from "../../api/audit.ts";

export const handlerFactory = (services: ServiceContainer) => getAuditEventsHandler(services.audit);
