import { ServiceContainer } from "@core/container.ts";
import { stopSidecarHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => stopSidecarHandler(services);
