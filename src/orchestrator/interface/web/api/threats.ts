import { Hono } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

export function createThreatsApi(services: ServiceContainer, security: SecurityMiddleware) {
    const router = new Hono();

    router.get("/feed", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const signals = await services.news.getLatestSignals(50);
        return c.json(signals);
    });

    router.get("/identified", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const type = c.req.query("type");
        const provider = c.req.query("provider");
        const search = c.req.query("search");
        // BUG-5.12 FIX: Bound the query limit to prevent DoS
        let limit = parseInt(c.req.query("limit") || "50");
        if (isNaN(limit) || limit < 1) limit = 50;
        if (limit > 500) limit = 500;

        const offset = c.req.query("offset");
        
        const result = await services.curatedIntel.getThreats({ type, provider, limit, offset, search });
        return c.json(result);
    });

    router.get("/identified/stats", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const stats = await services.curatedIntel.getStats();
        return c.json(stats);
    });

    router.post("/identified/sync", security.requireRole("admin", "operator"), async (c) => {
        const { provider } = await c.req.json().catch(() => ({}));
        await services.curatedIntel.sync(provider);
        return c.json({ success: true, provider });
    });

    router.post("/identified/wipe", security.requireRole("admin"), async (c) => {
        await services.curatedIntel.wipeDatabase();
        return c.json({ success: true });
    });

    return router;
}
