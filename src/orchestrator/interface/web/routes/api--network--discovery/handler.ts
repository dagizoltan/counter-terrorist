import { ServiceContainer } from "@core/container.ts";
import { networkDiscoveryHandler } from "../../api/network.ts";

export const handlerFactory = (services: ServiceContainer) => networkDiscoveryHandler(services);
