import { EventBus } from "./events.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { CanaryService } from "../protection/canary_service.ts";
import { BehavioralService } from "./behavioral_service.ts";
import { LoggingPort, LogType, LogSeverity } from "../../core/ports.ts";
import { BroadcastFunction } from "../orchestration/plugins/types.ts";

import { NetworkLogService } from "../analysis/network_log_service.ts";

export interface CommandPort {
    onEvent(topic: string, handler: (response: any) => void | Promise<void>): void;
}

/**
 * EventMediator
 * Orchestrates event routing between infrastructure (sidecars) and domain services.
 * This decouples the core application from specific sidecar event formats.
 */
export class EventMediator {
    constructor(
        private eventBus: EventBus,
        private processTracker: ProcessTracker,
        private canaryService: CanaryService,
        private broadcast: BroadcastFunction,
        private logger: LoggingPort,
        private networkLogs: NetworkLogService,
        private behavioral: BehavioralService
    ) {
        this.behavioral = new BehavioralAnalyzer();

        // SEC: Initialize in Learning Mode for the first 30 seconds to baseline startup syscalls
        this.behavioral.setLearningMode(true);
        setTimeout(() => {
            this.behavioral.setLearningMode(false);
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "SECURITY:BEHAVIORAL",
                message: "Neural Defense Learning Phase Complete. Transitioning to Active Enforcement."
            });
        }, 30000);
    }

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: CommandPort) {
        commandPort.onEvent("decoy", this.handleHoneypotEvent.bind(this));
        commandPort.onEvent("sentinel", this.handleEbpfEvent.bind(this));
        commandPort.onEvent("watchfile", this.handleWatchfileEvent.bind(this));
        commandPort.onEvent("netcap", this.handleNetcapEvent.bind(this));
        commandPort.onEvent("analyzer", this.handleAnalyzerEvent.bind(this));

        this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "BOOT",
            message: "Event Mediator: Sidecar routing established"
        }).catch(err => console.error("[EventMediator] Failed to log boot event:", err));
    }

    private handleHoneypotEvent(response: any): void {
        const event = response.data || response;
        this.broadcast({ 
            type: LogType.AUDIT, 
            severity: LogSeverity.ERROR,
            caller: event.caller || "decoy:honeypot",
            message: `Honeypot Trigger: ${event.type} from ${event.source_ip || 'remote'}`, 
            data: event 
        });
        this.eventBus.emit("HONEYPOT", event);
    }

    private async handleEbpfEvent(response: any): Promise<void> {
        const event = response.data || response;
        if (event.type === "SYSCALL_EVENT") {
            let type = "EBPF_SYSCALL";
            let severity = LogSeverity.INFO;

            // Neural Defense: Delegate to Behavioral Service
            const verdict = await this.behavioral.checkSyscallAnomalies(event.pid, event.comm, event.syscall, event.args || []);
            
            if (verdict === "ALERT" || verdict === "BLOCK_SYSCALL") {
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
                message: `eBPF Alert: ${event.comm} called ${event.syscall}`,
                data: event
            });
            this.eventBus.emit(type, event); 
            
            if (type === "EBPF_STRAY_SHELL") {
                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "SECURITY",
                    message: `Stray shell detected: ${event.comm} (PID: ${event.pid})`
                }).catch(err => console.error("[EventMediator] Failed to log stray shell:", err));
            }
        } else if (event.type === "NETWORK_LOG") {
            // Bridge network logs from eBPF
            this.networkLogs.log({
                direction: event.direction || "OUTBOUND",
                source: event.source,
                destination: event.destination,
                protocol: event.protocol || "TCP",
                length: event.bytes_count || 0,
                action: event.action || "ALLOW",
                timestamp: event.timestamp
            }).catch(err => console.error("[EventMediator] Failed to write network log:", err));

            this.broadcast({
                type: "NETWORK_LOG",
                severity: LogSeverity.INFO,
                message: `Network: ${event.source} -> ${event.destination} (${event.protocol})`,
                data: event
            });
        }
    }

    private async handleWatchfileEvent(response: any): Promise<void> {
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
            }).catch(err => console.error("[EventMediator] Failed to log FIM violation:", err));

            this.broadcast({ 
                type, 
                severity,
                caller,
                message: `FIM Alert: ${action} on ${path} [Actor: ${actor}]`, 
                data: payload 
            });
            this.eventBus.emit(isCanary ? "THREAT" : "DRIFT_PROCESS", payload); 
        }
    }

    private handleNetcapEvent(response: any): void {
        const event = response.data || response;
        const data = event.data || event;

        // Bridge sidecar packet events to the UI
        if (event.type === "PACKET" || event.type === "NETWORK_LOG" || event.type === "EXFIL_ALERT") {
            let severity = event.type === "EXFIL_ALERT" ? LogSeverity.ERROR : LogSeverity.INFO;
            const type = event.type === "EXFIL_ALERT" ? LogType.AUDIT : LogType.ACTIVITY;

            // Behavioral: Bot Detection on Network Logs
            let botScore = 0;
            if (event.type === "NETWORK_LOG" && data.source) {
                const analysis = this.behavioral.analyzeNetworkTraffic(data.source);
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
                }).catch(err => console.error("[EventMediator] Failed to log exfil alert:", err));
            }

            this.broadcast({ 
                type: event.type, 
                severity,
                message: data.message || `Packet intercepted on ${data.interface || 'mesh'} ${botScore > 0.8 ? '[BOT_PROBABILITY_HIGH]' : ''}`,
                data: { ...data, botScore }
            });

            // Persist to the tactical ledger
            if (event.type === "NETWORK_LOG" || event.type === "EXFIL_ALERT") {
                this.networkLogs.log({
                    timestamp: new Date().toISOString(),
                    direction: data.direction || "INBOUND",
                    source: data.source || "UNKNOWN",
                    destination: data.destination || "LOCAL",
                    protocol: data.protocol || "ANY",
                    length: data.bytes_count || 0,
                    action: event.type === "EXFIL_ALERT" ? "BLOCK" : (data.action || "ALLOW"),
                    botScore
                }).catch(err => console.error("[EventMediator] Failed to write network log:", err));
            }

            // EXFILTRATION ALERTING: Detect high-volume exfiltration from eBPF metrics
            if (event.type === "NETWORK_LOG" && data.bytes_count && data.bytes_count > 1024 * 1024 * 10) { // 10MB Threshold
                const msg = `EXFIL_DETECTION: High volume data transfer detected from ${data.source} (${(data.bytes_count / 1024 / 1024).toFixed(2)} MB)`;
                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "pcap:exfil",
                    message: msg,
                    payload: data
                }).catch(err => console.error("[EventMediator] Failed to log high volume exfil:", err));
                this.broadcast({ type: "EXFIL_ALERT", severity: LogSeverity.ERROR, message: msg, data });
            }
        } else if (event.type === "SIDECAR_ALERT") {
            this.broadcast({
                type: "ALERT",
                message: data.message || `PCAP Agent Alert: ${event.type}`,
                data: data
            });
        }
    }

    private handleAnalyzerEvent(response: any): void {
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
    }
}
