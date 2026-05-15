import { Hono } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { ComplianceMapper } from "@domain/analysis/compliance_mapper.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

export function createComplianceApi(services: ServiceContainer, security: SecurityMiddleware) {
    const router = new Hono();

    const mapper = new ComplianceMapper();

    router.get("/report", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const events = await services.audit.getRecentEvents(500);
        const mapped = await mapper.mapEvents(events);
        return c.json(mapper.generateJsonReport(mapped));
    });

    /**
     * Returns a real-time integrity snapshot for auditor review.
     */
    router.get("/snapshot", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const snapshot = await services.compliance.generateSnapshot();
        return c.json(snapshot);
    });

    /**
     * Exports a signed compliance bundle.
     */
    router.get("/export", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const bundle = await services.compliance.exportSignedBundle();
        return c.json(bundle);
    });

    router.get("/logs", security.requireRole("admin", "operator", "viewer"), async (c) => {
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

    router.get("/network", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const logs = await services.networkLogs.getRecent(200);
        return c.json(logs);
    });

    router.get("/audit", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const events = await services.audit.verifyChain(500); // verify last 500
        return c.json(events);
    });

    router.get("/incidents", security.requireRole("admin", "operator", "viewer"), async (c) => {
        const incidents = await services.incidents.getIncidents(100);
        return c.json(incidents);
    });

    router.post("/incidents/:id/status", security.requireRole("admin", "operator"), async (c) => {
        const id = c.req.param("id");
        const { status } = await c.req.json();
        await services.incidents.updateStatus(id, status);
        return c.json({ success: true });
    });

    return router;
}
