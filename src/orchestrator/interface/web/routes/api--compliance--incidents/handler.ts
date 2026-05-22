import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const incidents = await services.incidents.getIncidents(100);
    return c.json(incidents);
};
