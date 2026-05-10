import { LoggingPort, LogType, LogSeverity } from "../../core/ports.ts";

export type SubsystemStatus = "BOOTING" | "OPERATIONAL" | "DEGRADED" | "FAILED";

export interface SubsystemHealth {
    name: string;
    status: SubsystemStatus;
    lastUpdate: number;
    error?: string;
}

/**
 * HealthService
 * Central registry for monitoring the operational status of all background subsystems.
 */
export class HealthService {
    private states: Map<string, SubsystemHealth> = new Map();
    private sidecarQuotas: Map<string, { cpu: number, memory: number }> = new Map();

    constructor(private logger: LoggingPort) {
        // Default quotas for agents
        this.sidecarQuotas.set("ebpf", { cpu: 5.0, memory: 64 * 1024 * 1024 });
        this.sidecarQuotas.set("pcap", { cpu: 10.0, memory: 256 * 1024 * 1024 });
        this.sidecarQuotas.set("honeypot", { cpu: 2.0, memory: 32 * 1024 * 1024 });
    }

    reportStatus(name: string, status: SubsystemStatus, error?: string) {
        this.states.set(name, {
            name,
            status,
            lastUpdate: Date.now(),
            error
        });

        if (status === "FAILED") {
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "HEALTH",
                message: `Subsystem Failure: ${name} - ${error}`
            });
        } else if (status === "OPERATIONAL") {
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "HEALTH",
                message: `Subsystem Operational: ${name}`
            });
        }
    }

    getAllStatuses(): SubsystemHealth[] {
        return Array.from(this.states.values());
    }

    isFullyOperational(): boolean {
        return Array.from(this.states.values()).every(s => s.status === "OPERATIONAL");
    }

    getGlobalSeverity(): "SUCCESS" | "WARNING" | "DANGER" {
        const states = Array.from(this.states.values());
        if (states.some(s => s.status === "FAILED")) return "DANGER";
        if (states.some(s => s.status === "DEGRADED" || s.status === "BOOTING")) return "WARNING";
        return "SUCCESS";
    }

    /**
     * Monitors agent resources and flags anomalies.
     */
    async auditAgentResources(name: string, pid: number) {
        const quota = this.sidecarQuotas.get(name.toLowerCase());
        if (!quota) return;

        // In a real environment, we'd read /proc/[pid]/stat or use sysinfo
        // For now, we simulate the check
        const usage = { cpu: 0.1, rss: 1024 * 1024 }; // Mock

        if (usage.cpu > quota.cpu || usage.rss > quota.memory) {
            this.reportStatus(name, "DEGRADED", `Resource Quota Exceeded (CPU: ${usage.cpu}%, RAM: ${usage.rss} bytes)`);
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "HEALTH:QUOTA",
                message: `CRITICAL: Sidecar '${name}' exceeded resource quota. Potential compromise or exhaustion attack.`
            });
        }
    }
}
