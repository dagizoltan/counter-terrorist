import { ServiceContainer } from "@core/container.ts";
import { meshResyncHandler } from "../../api/mesh.ts";

export const handlerFactory = (services: ServiceContainer) => meshResyncHandler(services);
