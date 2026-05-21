import { ServiceContainer } from "@core/container.ts";
import { getComplianceReportHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => getComplianceReportHandler(services);
