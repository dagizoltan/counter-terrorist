import { ServiceContainer } from "@core/container.ts";
import { firewallUnblockHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => firewallUnblockHandler(services);
