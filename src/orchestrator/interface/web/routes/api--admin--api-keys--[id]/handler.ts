import { ServiceContainer } from "@core/container.ts";
import { revokeApiKeyHandler } from "../../api/admin.ts";

export const handlerFactory = (services: ServiceContainer) => revokeApiKeyHandler(services);
