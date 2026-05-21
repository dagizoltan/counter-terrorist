import { ServiceContainer } from "@core/container.ts";
import { sendAgentCommandHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => sendAgentCommandHandler(services);
