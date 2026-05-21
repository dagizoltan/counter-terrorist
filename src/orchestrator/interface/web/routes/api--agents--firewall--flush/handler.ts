import { ServiceContainer } from "@core/container.ts";
import { firewallFlushHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => firewallFlushHandler(services);
