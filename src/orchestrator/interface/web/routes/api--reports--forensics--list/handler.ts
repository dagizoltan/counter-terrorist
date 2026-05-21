import { ServiceContainer } from "@core/container.ts";
import { listForensicArtifactsHandler } from "../../api/reports.ts";

export const handlerFactory = (services: ServiceContainer) => listForensicArtifactsHandler();
