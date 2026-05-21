import { ServiceContainer } from "@core/container.ts";
import { firewallStatusHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => firewallStatusHandler(services);
