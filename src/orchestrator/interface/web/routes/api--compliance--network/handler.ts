import { ServiceContainer } from "@core/container.ts";
import { getComplianceNetworkLogsHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => getComplianceNetworkLogsHandler(services);
