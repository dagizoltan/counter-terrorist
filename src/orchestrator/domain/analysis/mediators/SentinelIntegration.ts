import { EventBus } from "../events.ts";
import { ProcessTracker } from "../process_tracker.ts";
import { BehavioralAnalyzer } from "../behavioral_analyzer.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BroadcastData } from "@interface/ws_handler.ts";

export class SentinelIntegration {
    constructor(
        private eventBus: EventBus,
        private behavioral: BehavioralAnalyzer,
        private logger: LoggingPort,
        private broadcast: (msg: BroadcastData) => void,
        private flushBatches: () => void,
        private syscallBatch: Record<string, unknown>[],
        private processTracker: ProcessTracker | null = null
    ) {}

    public setProcessTracker(tracker: ProcessTracker) {
        this.processTracker = tracker;
    }

    async handleEvent(event: Record<string, unknown>) {
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

            if (this.processTracker) {
                const analysis = await this.processTracker.analyzeEvent(pid, comm);
                if (analysis.isStrayShell) {
                    type = "EBPF_STRAY_SHELL";
                    severity = LogSeverity.WARNING;
                }
            }

            if (syscall === "connect" || syscall === "sys_connect") {
                this.broadcast({
                    type: "SOCKET_FLOW",
                    severity: LogSeverity.INFO,
                    message: `eBPF Socket Flow: ${comm} (PID: ${pid}) initiated connection`,
                    data: { ...event, comm, pid, syscall }
                });
                await this.eventBus.emit("SOCKET_FLOW", { ...event, comm, pid, syscall });
            }

            if (type !== "EBPF_SYSCALL") {
                this.broadcast({
                    type,
                    severity,
                    message: `eBPF Alert: ${comm} called ${syscall} [Anomaly: ${anomalyScore.toFixed(2)}]`,
                    data: { ...event, anomalyScore }
                });
                await this.eventBus.emit(type, event);
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
