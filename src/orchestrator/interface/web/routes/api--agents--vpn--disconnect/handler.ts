import { ServiceContainer } from "@core/container.ts";
import { vpnDisconnectHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => vpnDisconnectHandler(services);
