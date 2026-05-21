import { ServiceContainer } from "@core/container.ts";
import { getComplianceSnapshotHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => getComplianceSnapshotHandler(services);
