import { ServiceContainer } from "@core/container.ts";
import { agentDetailHandler } from "../ui--agents/handlers.ts";

export const handlerFactory = (_services: ServiceContainer, getStatus: () => Promise<unknown>) => agentDetailHandler(getStatus);
