import { ServiceContainer } from "@core/container.ts";
import { agentsHandler } from "../../features/infrastructure/agents/handlers.ts";

export const handlerFactory = (_services: ServiceContainer, getStatus: () => Promise<any>) => agentsHandler(getStatus);
