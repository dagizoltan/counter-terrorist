import { EventBus } from "./events.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { CanaryService } from "../protection/canary_service.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";
import { LoggingPort, LogType, LogSeverity } from "../../core/ports.ts";
import { BroadcastFunction } from "../orchestration/plugins/types.ts";

/**
 * EventMediator
 * Orchestrates event routing between infrastructure (sidecars) and domain services.
 * This decouples the core application from specific sidecar event formats.
 */
export class EventMediator {
    private behavioral: BehavioralAnalyzer;

    constructor(
        private eventBus: EventBus,
        private processTracker: ProcessTracker,
        private canaryService: CanaryService,
        private broadcast: BroadcastFunction,
        private logger: LoggingPort
    ) {
        this.behavioral = new BehavioralAnalyzer();
    }

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: any) {
        // 1. Honeypot Integration
        commandPort.onEvent("honeypot", (response: any) => {
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
        commandPort.onEvent("ebpf", async (response: any) => {
            const event = response.data || response;
            if (event.type === "SYSCALL_EVENT") {
                let type = "EBPF_SYSCALL";
                let severity = LogSeverity.INFO;

                // Neural Defense: Track and score syscall frequency
                this.behavioral.trackSyscall(event.comm, event.syscall);
                const anomalyScore = this.behavioral.getSyscallAnomalyScore(event.comm, event.syscall);

                if (event.syscall === "ptrace" || anomalyScore > 0.5) {
                    type = "EBPF_CRITICAL";
                    severity = LogSeverity.ERROR;
                }
                
                const analysis = await this.processTracker.analyzeEvent(event.pid, event.comm);
                if (analysis.isStrayShell) {
                    type = "EBPF_STRAY_SHELL";
                    severity = LogSeverity.WARNING;
                }
                
                this.broadcast({
                    type,
                    severity,
                    message: `eBPF Alert: ${event.comm} called ${event.syscall} [Anomaly: ${anomalyScore.toFixed(2)}]`,
                    data: { ...event, anomalyScore }
                });
                this.eventBus.emit(type, event); 
                
                if (type === "EBPF_STRAY_SHELL") {
                    this.logger.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "SECURITY",
                        message: `Stray shell detected: ${event.comm} (PID: ${event.pid})`
                    });
                }
            }
        });

        // 3. FIM (File Integrity) Integration
        commandPort.onEvent("fim", async (response: any) => {
            const event = response.data || response;
            const payload = event.data || event;
            if (payload?.type === "FileAlert") {
                const { path, action, comm, pid } = payload;
                const actor = comm || "system:internal";
                const isCanary = await this.canaryService.handleFileAccess(path, actor);
                
                // If it's a metadata modification (aging or IDE indexing), skip to avoid feedback loops
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
        commandPort.onEvent("pcap", (response: any) => {
            const event = response.data || response;
            const data = event.data || event;

            // Bridge sidecar packet events to the UI
            if (event.type === "PACKET" || event.type === "NETWORK_LOG" || event.type === "EXFIL_ALERT") {
                let severity = event.type === "EXFIL_ALERT" ? LogSeverity.ERROR : LogSeverity.INFO;
                const type = event.type === "EXFIL_ALERT" ? LogType.AUDIT : LogType.ACTIVITY;

                // Behavioral: Bot Detection on Network Logs
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
            } else if (event.type === "SIDECAR_ALERT") {
                this.broadcast({
                    type: "ALERT",
                    message: data.message || `PCAP Agent Alert: ${event.type}`,
                    data: data
                });
            }
        });

        // 5. Scanner Integration
        commandPort.onEvent("scanner", (response: any) => {
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
}
