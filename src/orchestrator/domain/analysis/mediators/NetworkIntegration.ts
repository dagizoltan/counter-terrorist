import { EventBus } from "../events.ts";
import { BehavioralAnalyzer } from "../behavioral_analyzer.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BroadcastData } from "@interface/ws_handler.ts";
import { EventRegistry } from "@core/event_schema.ts";

export class NetworkIntegration {
    constructor(
        private eventBus: EventBus,
        private behavioral: BehavioralAnalyzer,
        private logger: LoggingPort,
        private broadcast: (msg: BroadcastData) => void,
        private flushBatches: () => void,
        private networkBatch: Record<string, unknown>[]
    ) {}

    async handleEvent(event: Record<string, unknown>, data: Record<string, unknown>) {
        try {
            if (event.type === "NETWORK_LOG") {
                data = EventRegistry.NETWORK_LOG.parse(data);
            }
        } catch (e) {
            await this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "NETWORK:SCHEMA",
                message: `Malformed NETWORK event: ${(e as Error).message}`
            });
            return;
        }

        const eventType = typeof event.type === "string" ? event.type : "";
        const source = typeof data.source === "string" ? data.source : undefined;
        const message = typeof data.message === "string" ? data.message : undefined;
        const bytesCount = typeof data.bytes_count === "number" ? data.bytes_count : undefined;
        const iface = typeof data.interface === "string" ? data.interface : undefined;

        if (eventType === "PACKET" || eventType === "NETWORK_LOG" || eventType === "EXFIL_ALERT") {
            let severity = eventType === "EXFIL_ALERT" ? LogSeverity.ERROR : LogSeverity.INFO;
            const type = eventType === "EXFIL_ALERT" ? LogType.AUDIT : LogType.ACTIVITY;

            let botScore = 0;
            if (eventType === "NETWORK_LOG" && source) {
                this.behavioral.track(source);
                const analysis = this.behavioral.analyze(source);
                botScore = analysis.botProbability;
                if (botScore > 0.8) {
                    severity = LogSeverity.WARNING;
                }
            }

            if (event.type === "EXFIL_ALERT") {
                await this.logger.log({
                    timestamp: new Date().toISOString(),
                    type,
                    severity,
                    caller: "pcap:dissector",
                    message: typeof data.message === "string" ? data.message : "Network Exfiltration Attempt Detected",
                    payload: data
                });
            }

            this.broadcast({
                type: eventType,
                severity,
                message: message || `Packet intercepted on ${iface || 'mesh'} ${botScore > 0.8 ? '[BOT_PROBABILITY_HIGH]' : ''}`,
                data: { ...data, botScore }
            });

            if (eventType === "NETWORK_LOG" && bytesCount && bytesCount > 1024 * 1024 * 10) {
                const msg = `EXFIL_DETECTION: High volume data transfer detected from ${source || 'unknown'} (${(bytesCount / 1024 / 1024).toFixed(2)} MB)`;
                await this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "pcap:exfil",
                    message: msg,
                    payload: data
                });
                this.broadcast({ type: "EXFIL_ALERT", severity: LogSeverity.ERROR, message: msg, data });
            }
        } else if (eventType === "SIDECAR_ALERT") {
            this.broadcast({
                type: "ALERT",
                message: message || `PCAP Agent Alert: ${eventType}`,
                data: data
            });
        }
    }
}
