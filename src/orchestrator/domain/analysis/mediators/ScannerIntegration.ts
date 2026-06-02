import { EventBus } from "../events.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BroadcastData } from "@interface/ws_handler.ts";

export class ScannerIntegration {
    constructor(
        private eventBus: EventBus,
        private logger: LoggingPort,
        private broadcast: (msg: BroadcastData) => void
    ) {}

    async handleEvent(data: any) {
        const scanType = typeof data.type === "string" ? data.type : "";
        if (scanType === "ThreatDetected" || scanType === "RKH_SCAN_RESULT") {
            this.broadcast({
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "scanner:rkhunter",
                message: `Scanner Alert: ${scanType}`,
                data
            });

            await this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "scanner:rkhunter",
                message: `CRITICAL THREAT: ${scanType} identified by analyzer sidecar.`,
                payload: data
            });

            this.eventBus.emit("THREAT" as any, data as any);
        }
    }
}
