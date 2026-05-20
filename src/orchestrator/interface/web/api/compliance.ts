import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { ComplianceMapper } from "@domain/analysis/compliance_mapper.ts";

export const getComplianceReportHandler = (services: ServiceContainer) => async (c: Context) => {
    const mapper = new ComplianceMapper();
    const events = await services.audit.getRecentEvents(500);
    const mapped = await mapper.mapEvents(events);
    return c.json(mapper.generateJsonReport(mapped));
};

export const getComplianceSnapshotHandler = (services: ServiceContainer) => async (c: Context) => {
    const snapshot = await services.compliance.generateSnapshot();
    return c.json(snapshot);
};

export const exportSignedBundleHandler = (services: ServiceContainer) => async (c: Context) => {
    const bundle = await services.compliance.exportSignedBundle();
    return c.json(bundle);
};

export const getDiagnosticLogsHandler = (services: ServiceContainer) => async (c: Context) => {
    try {
        const logging = services.audit.getLogging();
        const kvLogs = await logging.getRecentLogs(500);
        const formatted = kvLogs.reverse().map(l => l.formatted || `[${l.timestamp}] [${l.type}] [${l.severity}] [${l.caller}] ${l.message}`).join("\n");
        return c.json({ logs: formatted || "No recent diagnostic telemetry captured in the ledger." });
    } catch (e) {
        return c.json({ logs: `Log Engine Failure: ${(e as Error).message}` });
    }
};

export const getComplianceNetworkLogsHandler = (services: ServiceContainer) => async (c: Context) => {
    const logs = await services.networkLogs.getRecent(200);
    return c.json(logs);
};

export const verifyComplianceAuditHandler = (services: ServiceContainer) => async (c: Context) => {
    const events = await services.audit.verifyChain(500);
    return c.json(events);
};

export const getIncidentsHandler = (services: ServiceContainer) => async (c: Context) => {
    const incidents = await services.incidents.getIncidents(100);
    return c.json(incidents);
};

export const updateIncidentStatusHandler = (services: ServiceContainer) => async (c: Context) => {
    const id = c.req.param("id");
    const { status } = await c.req.json();
    await services.incidents.updateStatus(id, status);
    return c.json({ success: true });
};
