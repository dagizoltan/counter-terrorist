import { ServiceContainer } from "@core/container.ts";
import { rotateIdentityHandler } from "../../api/network.ts";

export const handlerFactory = (services: ServiceContainer) => rotateIdentityHandler(services);
