import { EventBus } from "../events.ts";
import { ProcessTracker } from "../process_tracker.ts";
import { BehavioralAnalyzer } from "../behavioral_analyzer.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BroadcastData } from "@interface/ws_handler.ts";

export class SentinelIntegration {
    constructor(
        private eventBus: EventBus,
        private processTracker: ProcessTracker,
        private behavioral: BehavioralAnalyzer,
        private logger: LoggingPort,
        private broadcast: (msg: BroadcastData) => void,
        private flushBatches: () => void,
        private syscallBatch: any[]
    ) {}

    async handleEvent(event: any) {
        try {
            const { SyscallEventSchema } = await import("../../../core/event_schema.ts");
            if (event.type === "SYSCALL_EVENT") {
                const parsed = SyscallEventSchema.parse(event);
                Object.assign(event, parsed);
            }
        } catch (e) {
            await this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "SENTINEL:SCHEMA",
                message: `Malformed EBPF event: ${(e as Error).message}`
            });
            return;
        }

        if (event.type === "SYSCALL_EVENT") {
            this.syscallBatch.push(event);
            if (this.syscallBatch.length >= 50) {
                this.flushBatches();
            }

            let type = "EBPF_SYSCALL";
            let severity = LogSeverity.INFO;
            const pid = typeof event.pid === "number" ? event.pid : 0;
            const comm = typeof event.comm === "string" ? event.comm : "unknown";
            const syscall = typeof event.syscall === "string" ? event.syscall : "unknown";

            this.behavioral.trackSyscall(pid, comm, syscall);
            const anomalyScore = this.behavioral.getSyscallAnomalyScore(comm, syscall);

            const intent = this.behavioral.getIntentVerdict(pid);
            if (intent) {
                type = "EBPF_CRITICAL";
                severity = LogSeverity.ERROR;
                event.message = `[INTENT_MATCH: ${intent.intent}] ${event.comm} sequence identified as malicious.`;
            }

            if (syscall === "ptrace" || anomalyScore > 0.5) {
                type = "EBPF_CRITICAL";
                severity = LogSeverity.ERROR;
            }

            const analysis = await this.processTracker.analyzeEvent(pid, comm);
            if (analysis.isStrayShell) {
                type = "EBPF_STRAY_SHELL";
                severity = LogSeverity.WARNING;
            }

            if (type !== "EBPF_SYSCALL") {
                this.broadcast({
                    type,
                    severity,
                    message: `eBPF Alert: ${event.comm} called ${event.syscall} [Anomaly: ${anomalyScore.toFixed(2)}]`,
                    data: { ...event, anomalyScore }
                });
                this.eventBus.emit(type as any, event as any);
            }

            if (type === "EBPF_STRAY_SHELL") {
                await this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "SECURITY",
                    message: `Stray shell detected: ${event.comm} (PID: ${event.pid})`
                });
            }
        }
    }
}
