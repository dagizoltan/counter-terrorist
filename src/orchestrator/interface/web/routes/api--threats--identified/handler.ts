import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    const type = c.req.query("type");
    const provider = c.req.query("provider");
    const search = c.req.query("search");
    let limit = parseInt(c.req.query("limit") || "50");
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 500) limit = 500;

    const offset = c.req.query("offset");

    const result = await services.curatedIntel.getThreats({ type, provider, limit, offset, search });
    return c.json(result);
};
