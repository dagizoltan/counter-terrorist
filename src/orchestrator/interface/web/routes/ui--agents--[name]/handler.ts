import { ServiceContainer } from "@core/container.ts";
import { agentDetailHandler } from "../../features/infrastructure/agents/handlers.ts";

export const handlerFactory = (_services: ServiceContainer, getStatus: () => Promise<any>) => agentDetailHandler(getStatus);
