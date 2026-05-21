import { ServiceContainer } from "@core/container.ts";
import { agentsHandler } from "./handlers.ts";

export const handlerFactory = (_services: ServiceContainer, getStatus: () => Promise<any>) => agentsHandler(getStatus);
