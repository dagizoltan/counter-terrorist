import { ServiceContainer } from "@core/container.ts";
import { getDiagnosticLogsHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => getDiagnosticLogsHandler(services);
