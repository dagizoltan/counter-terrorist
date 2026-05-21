import { ServiceContainer } from "@core/container.ts";
import { deleteWebhookHandler } from "../../api/notifications.ts";

export const handlerFactory = (services: ServiceContainer) => deleteWebhookHandler(services.notifications);
