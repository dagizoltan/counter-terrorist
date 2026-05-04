import { EventBus } from "./events.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { CanaryService } from "../protection/canary_service.ts";
import { LoggingPort } from "../../core/ports.ts";
import { BroadcastFunction } from "../engine/plugins/types.ts";

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
        private logger: LoggingPort
    ) {}

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: any) {
        // 1. Honeypot Integration
        commandPort.onEvent("honeypot", (event: any) => {
            this.broadcast({ type: "HONEYPOT", message: `Honeypot Trigger: ${event.type}`, data: event });
            this.eventBus.emit("HONEYPOT", event);
        });

        // 2. eBPF Integration
        commandPort.onEvent("ebpf", async (event: any) => {
            if (event.type === "SYSCALL_EVENT") {
                let type = "EBPF_SYSCALL";
                if (event.syscall === "ptrace") type = "EBPF_CRITICAL";
                
                const analysis = await this.processTracker.analyzeEvent(event.pid, event.comm);
                if (analysis.isStrayShell) type = "EBPF_STRAY_SHELL";
                
                this.broadcast({ type, message: `eBPF Alert: ${event.comm} called ${event.syscall}`, data: event });
                this.eventBus.emit(type, event); 
                
                if (type === "EBPF_STRAY_SHELL") {
                    this.logger.log(`Stray shell detected: ${event.comm} (PID: ${event.pid})`, 2, "SECURITY");
                }
            }
        });

        // 3. FIM (File Integrity) Integration
        commandPort.onEvent("fim", (event: any) => {
            const payload = event.data;
            if (payload?.type === "FileAlert") {
                this.canaryService.handleFileAccess(payload.path, "UNKNOWN_COMM");
                this.broadcast({ type: "DRIFT_PROCESS", message: `FIM Alert: ${payload.action} on ${payload.path}`, data: payload });
                this.eventBus.emit("DRIFT_PROCESS", payload); 
            }
        });

        // 4. PCAP Integration
        commandPort.onEvent("pcap", (event: any) => {
            // Bridge sidecar packet events to the UI
            if (event.type === "PACKET" || event.type === "NETWORK_LOG") {
                this.broadcast({ 
                    type: event.type, 
                    message: event.message || `Packet intercepted on ${event.data?.interface || 'mesh'}`, 
                    data: event.data || event 
                });
            }
        });

        this.logger.log("Event Mediator: Sidecar routing established", 6, "BOOT");
    }
}
