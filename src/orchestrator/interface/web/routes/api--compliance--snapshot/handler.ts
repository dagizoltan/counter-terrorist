import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const snapshot = await services.compliance.generateSnapshot();
    return c.json(snapshot);
};
