import { ServiceContainer } from "@core/container.ts";
import { verifyComplianceAuditHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => verifyComplianceAuditHandler(services);
