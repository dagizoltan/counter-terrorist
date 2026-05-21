import { ServiceContainer } from "@core/container.ts";
import { vpnConnectHandler } from "../../api/agents.ts";

export const handlerFactory = (services: ServiceContainer) => vpnConnectHandler(services);
