import { ServiceContainer } from "@core/container.ts";
import { exportSignedBundleHandler } from "../../api/compliance.ts";

export const handlerFactory = (services: ServiceContainer) => exportSignedBundleHandler(services);
