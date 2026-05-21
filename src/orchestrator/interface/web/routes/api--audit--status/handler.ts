import { ServiceContainer } from "@core/container.ts";
import { getAuditStatusHandler } from "../../api/audit.ts";

export const handlerFactory = (services: ServiceContainer) => getAuditStatusHandler(services.audit);
