import { ServiceContainer } from "@core/container.ts";
import { verifyAuditChainHandler } from "../../api/audit.ts";

export const handlerFactory = (services: ServiceContainer) => verifyAuditChainHandler(services.audit);
