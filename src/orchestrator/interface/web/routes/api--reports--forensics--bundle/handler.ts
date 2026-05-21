import { ServiceContainer } from "@core/container.ts";
import { bundleForensicsHandler } from "../../api/reports.ts";

export const handlerFactory = (services: ServiceContainer) => bundleForensicsHandler(services.forensicService);
