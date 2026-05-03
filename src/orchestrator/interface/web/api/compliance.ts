import { Hono } from "hono";
import { ServiceContainer } from "@core/container.ts";

export function createComplianceApi(services: ServiceContainer) {
    const router = new Hono();

    /**
     * Returns a real-time integrity snapshot for auditor review.
     */
    router.get("/snapshot", async (c) => {
        const snapshot = await services.compliance.generateSnapshot();
        return c.json(snapshot);
    });

    /**
     * Exports a signed compliance bundle.
     */
    router.get("/export", async (c) => {
        const bundle = await services.compliance.exportSignedBundle();
        return c.json(bundle);
    });

    router.get("/logs", async (c) => {
        try {
            const logs = await Deno.readTextFile("./volume/logs/orchestrator.log");
            const tail = logs.split("\n").slice(-1000).join("\n");
            return c.json({ logs: tail });
        } catch {
            return c.json({ logs: "No system logs available." });
        }
    });

    router.get("/network", async (c) => {
        const logs = await services.networkLogs.getLogs(200);
        return c.json(logs);
    });

    router.get("/audit", async (c) => {
        const events = await services.audit.verifyChain(500); // verify last 500
        return c.json(events);
    });

    router.get("/incidents", async (c) => {
        const incidents = await services.incidents.getIncidents(100);
        return c.json(incidents);
    });

    router.post("/incidents/:id/status", async (c) => {
        const id = c.req.param("id");
        const { status } = await c.req.json();
        await services.incidents.updateStatus(id, status);
        return c.json({ success: true });
    });

    return router;
}
