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
            const logging = services.audit.getLogging();
            const kvLogs = await logging.getRecentLogs(500);
            
            // Re-sort back to chronological for the UI (TimelineRepository returns newest first)
            const formatted = kvLogs.reverse().map(l => l.formatted || `[${l.timestamp}] [${l.type}] [${l.severity}] [${l.caller}] ${l.message}`).join("\n");
            
            return c.json({ 
                logs: formatted || "No recent diagnostic telemetry captured in the ledger." 
            });
        } catch (e) {
            return c.json({ logs: `Log Engine Failure: ${(e as Error).message}` });
        }
    });

    router.get("/network", async (c) => {
        const logs = await services.networkLogs.getRecent(200);
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
