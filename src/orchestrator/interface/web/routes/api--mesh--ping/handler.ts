import { ServiceContainer } from "@core/container.ts";
import { meshPingHandler } from "../../api/mesh.ts";

export const handlerFactory = (services: ServiceContainer) => meshPingHandler(services);
