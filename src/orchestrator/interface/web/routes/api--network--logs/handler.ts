import { ServiceContainer } from "@core/container.ts";
import { networkLogsHandler } from "../../api/network.ts";

export const handlerFactory = (services: ServiceContainer) => networkLogsHandler(services);
