import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const getThreatSignalsHandler = (services: ServiceContainer) => async (c: Context) => {
    const signals = await services.news.getLatestSignals(50);
    return c.json(signals);
};

export const getIdentifiedThreatsHandler = (services: ServiceContainer) => async (c: Context) => {
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

export const getThreatStatsHandler = (services: ServiceContainer) => async (c: Context) => {
    const stats = await services.curatedIntel.getStats();
    return c.json(stats);
};

export const syncThreatsHandler = (services: ServiceContainer) => async (c: Context) => {
    const { provider } = await c.req.json().catch(() => ({}));
    await services.curatedIntel.sync(provider);
    return c.json({ success: true, provider });
};

export const wipeThreatsHandler = (services: ServiceContainer) => async (c: Context) => {
    await services.curatedIntel.wipeDatabase();
    return c.json({ success: true });
};
