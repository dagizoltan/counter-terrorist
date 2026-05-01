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
        const threats = await services.curatedIntel.getThreats(type);
        return c.json(threats);
    });

    router.post("/identified/sync", async (c) => {
        await services.curatedIntel.sync();
        return c.json({ success: true });
    });

    router.post("/identified/wipe", async (c) => {
        await services.curatedIntel.wipeDatabase();
        return c.json({ success: true });
    });

    return router;
}
