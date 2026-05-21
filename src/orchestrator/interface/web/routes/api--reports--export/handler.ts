import { ServiceContainer } from "@core/container.ts";
import { exportReportHandler } from "../../api/reports.ts";

export const handlerFactory = (services: ServiceContainer) => exportReportHandler(services.baseline, services.protection);
