import { EventBus } from "../events.ts";
import { CanaryService } from "../../protection/canary_service.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BroadcastData } from "@interface/ws_handler.ts";

export class FimIntegration {
    constructor(
        private eventBus: EventBus,
        private canaryService: CanaryService,
        private logger: LoggingPort,
        private broadcast: (msg: BroadcastData) => void
    ) {}

    async handleEvent(payload: any) {
        try {
            const { FileDriftSchema } = await import("../../../core/event_schema.ts");
            if (payload?.type === "FileAlert") {
                payload = FileDriftSchema.parse(payload);
            }
        } catch (e) {
            await this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "FIM:SCHEMA",
                message: `Malformed FIM event: ${(e as Error).message}`
            });
            return;
        }

        if (payload?.type === "FileAlert") {
            const path = typeof payload.path === "string" ? payload.path : "unknown";
            const action = typeof payload.action === "string" ? payload.action : "unknown";
            const comm = typeof payload.comm === "string" ? payload.comm : undefined;
            const pid = typeof payload.pid === "number" ? payload.pid : undefined;
            const actor = comm || "system:internal";
            const isCanary = await this.canaryService.handleFileAccess(path, actor);

            if (isCanary && action.includes("Metadata")) {
                return;
            }

            const type = isCanary ? LogType.AUDIT : LogType.ACTIVITY;
            const caller = isCanary ? "decoy:canary" : "fim:observer";
            const severity = isCanary ? LogSeverity.ERROR : LogSeverity.WARNING;

            await this.logger.log({
                timestamp: new Date().toISOString(),
                type,
                severity,
                caller,
                message: `File Integrity Violation: ${action} detected on ${path} by ${actor} (PID: ${pid || 'N/A'})`,
                payload: { path, action, isCanary, actor, pid }
            });

            this.broadcast({
                type,
                severity,
                caller,
                message: `FIM Alert: ${action} on ${path} [Actor: ${actor}]`,
                data: payload
            });
            this.eventBus.emit((isCanary ? "THREAT" : "DRIFT_PROCESS") as any, payload as any);
        }
    }
}
