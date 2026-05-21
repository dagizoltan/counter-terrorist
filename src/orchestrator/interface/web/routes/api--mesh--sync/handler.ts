import { ServiceContainer } from "@core/container.ts";
import { meshSyncHandler } from "../../api/mesh.ts";

export const handlerFactory = (services: ServiceContainer) => meshSyncHandler(services);
