import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const signals = await services.news.getLatestSignals(50);
    return c.json(signals);
};
