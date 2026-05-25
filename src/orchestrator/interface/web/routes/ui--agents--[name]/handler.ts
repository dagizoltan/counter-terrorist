import { ServiceContainer } from "@core/container.ts";
import { agentDetailHandler } from "../ui--agents/handlers.ts";
import { ApplicationStatus } from "@core/ports.ts";

export const handlerFactory = (_services: ServiceContainer, getStatus: () => Promise<ApplicationStatus>) => agentDetailHandler(getStatus);
