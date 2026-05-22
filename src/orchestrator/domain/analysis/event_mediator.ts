import { EventBus } from "./events.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { CanaryService } from "../protection/canary_service.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";
import { LoggingPort, LogType, LogSeverity, CommandPort } from "../../core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

/**
 * EventMediator
 * Orchestrates event routing between infrastructure (sidecars) and domain services.
 * This decouples the core application from specific sidecar event formats.
 */
export class EventMediator extends BaseService {
    private behavioral: BehavioralAnalyzer;
    private learningTimeout: number | null = null;

    // Performance: High-volume event batching
    private syscallBatch: any[] = [];
    private networkBatch: any[] = [];
    private readonly BATCH_THRESHOLD = 50;
    private batchTimer?: number;

    override async init(): Promise<Result<void>> {
        if (this.initialized) return ok(undefined);
        this.initialized = true;
        return ok(undefined);
    }

    override async shutdown(): Promise<Result<void>> {
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
        this.initialized = false;
        return await super.shutdown();
    }

    constructor(
        private eventBusPort: EventBus,
        private processTracker: ProcessTracker,
        private canaryService: CanaryService,
        private broadcast: (msg: any) => void,
        private logger: LoggingPort,
        private kv?: Deno.Kv
    ) {
        super();
        this.setEventBus(eventBusPort);
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

        this.eventBus.on("UI_BROADCAST", (msg: any) => {
            this.broadcast(msg);
        });

        // Periodic batch flush
        this.batchTimer = setInterval(() => this.flushBatches(), 1000);
    }

    private flushBatches() {
        if (this.syscallBatch.length > 0) {
            this.eventBus.emit("EBPF_SYSCALL_BATCH" as any, [...this.syscallBatch]);
            this.syscallBatch = [];
        }
        if (this.networkBatch.length > 0) {
            this.eventBus.emit("NETWORK_LOG_BATCH" as any, [...this.networkBatch]);
            this.networkBatch = [];
        }
    }

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: CommandPort) {
        // 1. Honeypot Integration
        commandPort.onEvent("decoy", (response: any) => {
            const event = response.data || response;
            this.broadcast({ 
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: event.caller || "decoy:honeypot",
                message: `Honeypot Trigger: ${event.type} from ${event.source_ip || 'remote'}`,
                data: event
            });
            this.eventBus.emit("HONEYPOT", event);
        });

        // 2. eBPF Integration
        commandPort.onEvent("sentinel", async (response: any) => {
            const event = response.data || response;
            if (event.type === "SYSCALL_EVENT") {
                this.syscallBatch.push(event);
                if (this.syscallBatch.length >= this.BATCH_THRESHOLD) {
                    this.flushBatches();
                }

                let type: any = "EBPF_SYSCALL";
                let severity = LogSeverity.INFO;

                this.behavioral.trackSyscall(event.pid, event.comm, event.syscall);
                const anomalyScore = this.behavioral.getSyscallAnomalyScore(event.comm, event.syscall);

                const intent = this.behavioral.getIntentVerdict(event.pid);
                if (intent) {
                    type = "EBPF_CRITICAL";
                    severity = LogSeverity.ERROR;
                    event.message = `[INTENT_MATCH: ${intent.intent}] ${event.comm} sequence identified as malicious.`;
                }

                if (event.syscall === "ptrace" || anomalyScore > 0.5) {
                    type = "EBPF_CRITICAL";
                    severity = LogSeverity.ERROR;
                }

                const analysis = await this.processTracker.analyzeEvent(event.pid, event.comm);
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
                    this.eventBus.emit(type, event);
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
        });

        // 3. FIM Integration
        commandPort.onEvent("watchfile", async (response: any) => {
            const event = response.data || response;
            const payload = event.data || event;
            if (payload?.type === "FileAlert") {
                const { path, action, comm, pid } = payload;
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
                this.eventBus.emit(isCanary ? "THREAT" : "DRIFT_PROCESS", payload);
            }
        });

        // 4. PCAP Integration
        commandPort.onEvent("netcap", (response: any) => {
            const event = response.data || response;
            const data = event.data || event;

            if (event.type === "PACKET" || event.type === "NETWORK_LOG" || event.type === "EXFIL_ALERT") {
                if (event.type === "NETWORK_LOG") {
                    this.networkBatch.push(data);
                    if (this.networkBatch.length >= this.BATCH_THRESHOLD) {
                        this.flushBatches();
                    }
                }

                let severity = event.type === "EXFIL_ALERT" ? LogSeverity.ERROR : LogSeverity.INFO;
                const type = event.type === "EXFIL_ALERT" ? LogType.AUDIT : LogType.ACTIVITY;

                let botScore = 0;
                if (event.type === "NETWORK_LOG" && data.source) {
                    this.behavioral.track(data.source);
                    const analysis = this.behavioral.analyze(data.source);
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
                        message: data.message || "Network Exfiltration Attempt Detected",
                        payload: data
                    }).catch(() => {});
                }

                this.broadcast({
                    type: event.type,
                    severity,
                    message: data.message || `Packet intercepted on ${data.interface || 'mesh'} ${botScore > 0.8 ? '[BOT_PROBABILITY_HIGH]' : ''}`,
                    data: { ...data, botScore }
                });

                if (event.type === "NETWORK_LOG" && data.bytes_count && data.bytes_count > 1024 * 1024 * 10) {
                    const msg = `EXFIL_DETECTION: High volume data transfer detected from ${data.source} (${(data.bytes_count / 1024 / 1024).toFixed(2)} MB)`;
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
            } else if (event.type === "SIDECAR_ALERT") {
                this.broadcast({
                    type: "ALERT",
                    message: data.message || `PCAP Agent Alert: ${event.type}`,
                    data: data
                });
            }
        });

        // 5. Scanner Integration
        commandPort.onEvent("analyzer", async (response: any) => {
            const event = response.data || response;
            const data = event.data || event;
            if (data.type === "ThreatDetected" || data.type === "RKH_SCAN_RESULT") {
                this.broadcast({
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "scanner:rkhunter",
                    message: `Scanner Alert: ${data.type}`,
                    data
                });

                // SOV-06 FIX: Await logging for high-severity scanner findings
                await this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "scanner:rkhunter",
                    message: `CRITICAL THREAT: ${data.type} identified by analyzer sidecar.`,
                    payload: data
                });

                this.eventBus.emit("THREAT", data);
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

    /**
     * Broadcasts a manual event to all connected UI clients.
     */
    broadcastEvent(event: any) {
        this.broadcast(event);
    }
}
