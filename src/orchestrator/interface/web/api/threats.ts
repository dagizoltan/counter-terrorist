import { Hono } from "hono";
import { ServiceContainer } from "@core/container.ts";

export function createThreatsApi(services: ServiceContainer) {
    const router = new Hono();

    router.get("/feed", async (c) => {
        const signals = await services.news.getLatestSignals(50);
        return c.json(signals);
    });

    router.get("/identified", async (c) => {
        const type = c.req.query("type");
        const provider = c.req.query("provider");
        const search = c.req.query("search");
        const limit = parseInt(c.req.query("limit") || "50");
        const offset = c.req.query("offset");
        
        const result = await services.curatedIntel.getThreats({ type, provider, limit, offset, search });
        return c.json(result);
    });

    router.get("/identified/stats", async (c) => {
        const stats = await services.curatedIntel.getStats();
        return c.json(stats);
    });

    router.post("/identified/sync", async (c) => {
        const role = c.get("role");
        if (role !== "admin" && role !== "operator") return c.json({ error: "Forbidden" }, 403);

        const { provider } = await c.req.json().catch(() => ({}));
        await services.curatedIntel.sync(provider);
        return c.json({ success: true, provider });
    });

    router.post("/identified/wipe", async (c) => {
        const role = c.get("role");
        if (role !== "admin") return c.json({ error: "Forbidden: Admin role required for database wipe" }, 403);

        await services.curatedIntel.wipeDatabase();
        return c.json({ success: true });
    });

    return router;
}
