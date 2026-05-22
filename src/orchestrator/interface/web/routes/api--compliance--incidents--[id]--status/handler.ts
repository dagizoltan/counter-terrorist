import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const id = c.req.param("id");
    const { status } = await c.req.json();
    await services.incidents.updateStatus(id, status);
    return c.json({ success: true });
};
