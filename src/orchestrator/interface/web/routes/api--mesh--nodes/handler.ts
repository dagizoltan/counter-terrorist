import { ServiceContainer } from "@core/container.ts";
import { meshNodesHandler } from "../../api/mesh.ts";

export const handlerFactory = (services: ServiceContainer) => meshNodesHandler(services);
