import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
    try {
        const logging = services.audit.getLogging();
        const kvLogs = await logging.getRecentLogs(500);
        const formatted = kvLogs.reverse().map(l => l.formatted || `[${l.timestamp}] [${l.type}] [${l.severity}] [${l.caller}] ${l.message}`).join("\n");
        return c.json({ logs: formatted || "No recent diagnostic telemetry captured in the ledger." });
    } catch (e) {
        return c.json({ logs: `Log Engine Failure: ${(e as Error).message}` });
    }
};
