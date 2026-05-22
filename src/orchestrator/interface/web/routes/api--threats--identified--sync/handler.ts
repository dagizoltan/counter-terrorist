import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const { provider } = await c.req.json().catch(() => ({}));
    await services.curatedIntel.sync(provider);
    return c.json({ success: true, provider });
};
