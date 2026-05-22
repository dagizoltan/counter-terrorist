import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const stats = await services.curatedIntel.getStats();
    return c.json(stats);
};
