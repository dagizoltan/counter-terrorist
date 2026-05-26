import { EventBus } from "./events.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { CanaryService } from "../protection/canary_service.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";
import { LoggingPort, LogType, LogSeverity, CommandPort } from "../../core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { BroadcastData } from "@interface/ws_handler.ts";
import { Result, ok } from "../../core/result.ts";

type SidecarEvent = Record<string, unknown>;

const unpackSidecar = (value: unknown): SidecarEvent =>
  typeof value === "object" && value !== null ? value as SidecarEvent : {} as SidecarEvent;

const unwrapSidecar = (value: unknown): SidecarEvent => {
  const payload = unpackSidecar(value);
  return typeof payload.data === "object" && payload.data !== null
    ? payload.data as SidecarEvent
    : payload;
};

/**
 * EventMediator
 * Orchestrates event routing between infrastructure (sidecars) and domain services.
 * This decouples the core application from specific sidecar event formats.
 */
export class EventMediator extends BaseService {
    private behavioral: BehavioralAnalyzer;
    private learningTimeout: number | null = null;

    // Performance: High-volume event batching
    private syscallBatch: SidecarEvent[] = [];
    private networkBatch: SidecarEvent[] = [];
    private readonly BATCH_THRESHOLD = 50;
    private batchTimer?: number;

    protected override onInit(): Promise<Result<void>> {
        return Promise.resolve(ok(undefined));
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.learningTimeout) {
            clearTimeout(this.learningTimeout);
            this.learningTimeout = null;
        }
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }

        // SOV-06 FIX: Final batch flush on shutdown to prevent telemetry loss
        this.flushBatches();

        if (this.behavioral) {
            await this.behavioral.shutdown();
        }

        await this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:analysis:event_mediator",
            message: "Event Mediator offline."
        });
        return ok(undefined);
    }

    constructor(
        private eventBusPort: EventBus,
        private processTracker: ProcessTracker,
        private canaryService: CanaryService,
        private broadcast: (msg: BroadcastData) => void,
        private logger: LoggingPort,
        private kv?: Deno.Kv
    ) {
        super();
        this.setEventBus(eventBusPort);
        this.eventBus = eventBusPort;
        this.behavioral = new BehavioralAnalyzer();
        if (kv) {
            this.behavioral.setKv(kv).catch(() => {});
        }

        this.behavioral.setLearningMode(true);
        this.learningTimeout = setTimeout(() => {
            this.learningTimeout = null;
            this.behavioral.setLearningMode(false);
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "SECURITY:BEHAVIORAL",
                message: "Neural Defense Learning Phase Complete. Transitioning to Active Enforcement."
            });
        }, 30000);

        this.eventBus?.on("UI_BROADCAST", (msg: unknown) => {
            if (typeof msg === "object" && msg !== null) {
                this.broadcast(msg as BroadcastData);
            }
        });

        // Periodic batch flush
        this.batchTimer = setInterval(() => this.flushBatches(), 1000);
    }

    private flushBatches() {
        if (this.syscallBatch.length > 0) {
            this.eventBus?.emit("EBPF_SYSCALL_BATCH" as any, [...this.syscallBatch] as any);
            this.syscallBatch = [];
        }
        if (this.networkBatch.length > 0) {
            this.eventBus?.emit("NETWORK_LOG_BATCH" as any, [...this.networkBatch] as any);
            this.networkBatch = [];
        }
    }

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: CommandPort) {
        // 1. Honeypot Integration
        commandPort.onEvent("decoy", (response: unknown) => {
            try {
                const payload = (typeof response === "object" && response !== null ? response as SidecarEvent : {} as SidecarEvent);
                const event = (payload.data as SidecarEvent) ?? payload;
                this.broadcast({
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: typeof event.caller === "string" ? event.caller : "decoy:honeypot",
                    message: `Honeypot Trigger: ${typeof event.type === "string" ? event.type : "unknown"} from ${typeof event.source_ip === "string" ? event.source_ip : "remote"}`,
                    data: event
                });
                this.eventBus?.emit("HONEYPOT" as any, event as any);
            } catch (e) {
                this.handleMediatorError(e as Error, "decoy");
            }
        });

        // 2. eBPF Integration
        commandPort.onEvent("sentinel", async (response: unknown) => {
            try {
            const event = unwrapSidecar(response);

            // SOV-06: Schema enforcement for IPC
            try {
                const { SyscallEventSchema } = await import("../../core/event_schema.ts");
                if (event.type === "SYSCALL_EVENT") {
                    const parsed = SyscallEventSchema.parse(event);
                    Object.assign(event, parsed);
                }
            } catch (e) {
                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "MEDIATOR:SCHEMA",
                    message: `Malformed EBPF event: ${(e as Error).message}`
                });
                return;
            }

            if (event.type === "SYSCALL_EVENT") {
                this.syscallBatch.push(event);
                if (this.syscallBatch.length >= this.BATCH_THRESHOLD) {
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

                // Still broadcast critical/stray shell alerts individually for real-time visibility
                if (type !== "EBPF_SYSCALL") {
                    this.broadcast({
                        type,
                        severity,
                        message: `eBPF Alert: ${event.comm} called ${event.syscall} [Anomaly: ${anomalyScore.toFixed(2)}]`,
                        data: { ...event, anomalyScore }
                    });
                    this.eventBus?.emit(type as any, event as any);
                }

                if (type === "EBPF_STRAY_SHELL") {
                    // SOV-06 FIX: Await logging for critical security alerts
                    await this.logger.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "SECURITY",
                        message: `Stray shell detected: ${event.comm} (PID: ${event.pid})`
                    });
                }
            }
            } catch (e) {
                this.handleMediatorError(e as Error, "sentinel");
            }
        });

        // 3. FIM Integration
        commandPort.onEvent("watchfile", async (response: unknown) => {
            try {
            const event = unwrapSidecar(response);
            let payload = unwrapSidecar(event);

            // SOV-06: Schema enforcement for IPC
            try {
                const { FileDriftSchema } = await import("../../core/event_schema.ts");
                if (payload?.type === "FileAlert") {
                    payload = FileDriftSchema.parse(payload);
                }
            } catch (e) {
                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "MEDIATOR:SCHEMA",
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

                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type,
                    severity,
                    caller,
                    message: `File Integrity Violation: ${action} detected on ${path} by ${actor} (PID: ${pid || 'N/A'})`,
                    payload: { path, action, isCanary, actor, pid }
                }).catch(() => {});

                this.broadcast({
                    type,
                    severity,
                    caller,
                    message: `FIM Alert: ${action} on ${path} [Actor: ${actor}]`,
                    data: payload
                });
                this.eventBus?.emit((isCanary ? "THREAT" : "DRIFT_PROCESS") as any, payload as any);
            }
            } catch (e) {
                this.handleMediatorError(e as Error, "watchfile");
            }
        });

        // 4. PCAP Integration
        commandPort.onEvent("netcap", async (response: unknown) => {
            try {
            const event = unwrapSidecar(response);
            let data = unwrapSidecar(event);

            // SOV-06: Schema enforcement for IPC
            try {
                const { NetworkLogSchema } = await import("../../core/event_schema.ts");
                if (event.type === "NETWORK_LOG") {
                    data = NetworkLogSchema.parse(data);
                }
            } catch (e) {
                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "MEDIATOR:SCHEMA",
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
                if (eventType === "NETWORK_LOG") {
                    this.networkBatch.push(data);
                    if (this.networkBatch.length >= this.BATCH_THRESHOLD) {
                        this.flushBatches();
                    }
                }

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
                    this.logger.log({
                        timestamp: new Date().toISOString(),
                        type,
                        severity,
                        caller: "pcap:dissector",
                        message: typeof data.message === "string" ? data.message : "Network Exfiltration Attempt Detected",
                        payload: data
                    }).catch(() => {});
                }

                this.broadcast({
                    type: eventType,
                    severity,
                    message: message || `Packet intercepted on ${iface || 'mesh'} ${botScore > 0.8 ? '[BOT_PROBABILITY_HIGH]' : ''}`,
                    data: { ...data, botScore }
                });

                if (eventType === "NETWORK_LOG" && bytesCount && bytesCount > 1024 * 1024 * 10) {
                    const msg = `EXFIL_DETECTION: High volume data transfer detected from ${source || 'unknown'} (${(bytesCount / 1024 / 1024).toFixed(2)} MB)`;
                    this.logger.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "pcap:exfil",
                        message: msg,
                        payload: data
                    }).catch(() => {});
                    this.broadcast({ type: "EXFIL_ALERT", severity: LogSeverity.ERROR, message: msg, data });
                }
            } else if (eventType === "SIDECAR_ALERT") {
                this.broadcast({
                    type: "ALERT",
                    message: message || `PCAP Agent Alert: ${eventType}`,
                    data: data
                });
            }
            } catch (e) {
                this.handleMediatorError(e as Error, "netcap");
            }
        });

        // 5. Scanner Integration
        commandPort.onEvent("analyzer", async (response: unknown) => {
            try {
            const event = unwrapSidecar(response);
            const data = unwrapSidecar(event);
            const scanType = typeof data.type === "string" ? data.type : "";
            if (scanType === "ThreatDetected" || scanType === "RKH_SCAN_RESULT") {
                this.broadcast({
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "scanner:rkhunter",
                    message: `Scanner Alert: ${scanType}`,
                    data
                });

                // SOV-06 FIX: Await logging for high-severity scanner findings
                await this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "scanner:rkhunter",
                    message: `CRITICAL THREAT: ${scanType} identified by analyzer sidecar.`,
                    payload: data
                });

                this.eventBus?.emit("THREAT" as any, data as any);
            }
            } catch (e) {
                this.handleMediatorError(e as Error, "analyzer");
            }
        });

        this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "BOOT",
            message: "Event Mediator: Sidecar routing established"
        });
    }

    private handleMediatorError(e: Error, sidecar: string) {
        this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:analysis:event_mediator",
            message: `Error processing ${sidecar} event: ${e.message}`
        }).catch(() => {});
    }

    /**
     * Broadcasts a manual event to all connected UI clients.
     */
    broadcastEvent(event: BroadcastData) {
        this.broadcast(event);
    }
}
