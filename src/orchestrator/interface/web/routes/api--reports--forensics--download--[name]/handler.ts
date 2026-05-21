import { ServiceContainer } from "@core/container.ts";
import { downloadForensicArtifactHandler } from "../../api/reports.ts";

export const handlerFactory = (services: ServiceContainer) => downloadForensicArtifactHandler();
