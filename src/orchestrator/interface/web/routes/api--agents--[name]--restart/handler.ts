import { ServiceContainer } from "@core/container.ts";
import { restartSidecarHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => restartSidecarHandler(services);
