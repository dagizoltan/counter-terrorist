import { ServiceContainer } from "@core/container.ts";
import { firewallBlockHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => firewallBlockHandler(services);
