import { ServiceContainer } from "@core/container.ts";
import { setStealthModeHandler } from "../../api/network.ts";

export const handlerFactory = (services: ServiceContainer) => setStealthModeHandler(services);
