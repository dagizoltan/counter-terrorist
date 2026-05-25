import { ServiceContainer } from "@core/container.ts";
import { agentsHandler } from "./handlers.ts";
import { ApplicationStatus } from "@core/ports.ts";

export const handlerFactory = (_services: ServiceContainer, getStatus: () => Promise<ApplicationStatus>) => agentsHandler(getStatus);
