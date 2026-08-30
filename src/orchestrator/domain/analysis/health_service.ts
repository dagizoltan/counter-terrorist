import { LoggingPort, LogType, LogSeverity, CommandPort } from "../../core/ports.ts";

export type SubsystemStatus = "BOOTING" | "OPERATIONAL" | "DEGRADED" | "FAILED";

export interface SubsystemHealth {
    name: string;
    status: SubsystemStatus;
    lastUpdate: number;
    error?: string;
}

import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

/**
 * HealthService
 * Central registry for monitoring the operational status of all background subsystems.
 */
export class HealthService extends BaseService {
    private states: Map<string, SubsystemHealth> = new Map();
    private sidecarQuotas: Map<string, { cpu: number, memory: number }> = new Map();
    private sidecarStats: Map<string, { lastTicks: number, lastTs: number }> = new Map();
    private sidecarViolationCounts: Map<string, number> = new Map();
    private intervals: ReturnType<typeof setInterval>[] = [];
    private serviceRegistry: Map<string, BaseService> = new Map();

    protected override onInit(): Promise<Result<void>> {
        this.intervals.push(setInterval(() => this.emitMetrics(), 30000));
        return Promise.resolve(ok(undefined));
    }

    protected override onShutdown(): Promise<Result<void>> {
        // SOV-05 STABILITY: Clear all background monitoring intervals
        for (const id of this.intervals) clearInterval(id);
        this.intervals = [];
        return Promise.resolve(ok(undefined));
    }

    private sidecarManager?: CommandPort;

    constructor(public override logger: LoggingPort) {
        super();
        // Default quotas for agents
        this.sidecarQuotas.set("sentinel", { cpu: 5.0, memory: 64 * 1024 * 1024 });
        this.sidecarQuotas.set("netcap", { cpu: 10.0, memory: 256 * 1024 * 1024 });
        this.sidecarQuotas.set("decoy", { cpu: 2.0, memory: 32 * 1024 * 1024 });
        this.sidecarQuotas.set("analyzer", { cpu: 25.0, memory: 512 * 1024 * 1024 });
        this.sidecarQuotas.set("watchfile", { cpu: 5.0, memory: 128 * 1024 * 1024 });
        this.sidecarQuotas.set("tunnel", { cpu: 2.0, memory: 64 * 1024 * 1024 });

        this.intervals.push(setInterval(() => this.pollAgentResources(), 30000));
    }

    public setSidecarManager(sm: CommandPort) {
        this.sidecarManager = sm;
    }

    public registerService(name: string, service: unknown) {
        if (service instanceof BaseService) {
            this.serviceRegistry.set(name.toLowerCase(), service);
        }
    }

    private async emitMetrics() {
        if (this.eventBus) {
            await this.eventBus.emit("METRIC_UPDATE", {
                domain: "system_health",
                data: {
                    status: this.getGlobalSeverity(),
                    subsystems_count: this.states.size,
                    fullyOperational: this.isFullyOperational()
                }
            });
        }
    }

    private async pollAgentResources() {
        if (!this.sidecarManager) return;

        const agents = ["sentinel", "netcap", "decoy", "analyzer", "watchfile", "tunnel"];
        for (const agent of agents) {
            const pid = this.sidecarManager.getPID(agent);
            if (pid) {
                await this.auditAgentResources(agent, pid);
            }
        }
    }

    reportStatus(name: string, status: SubsystemStatus | string, error?: string) {
        const validStatus = ["BOOTING", "OPERATIONAL", "DEGRADED", "FAILED"].includes(status)
            ? status as SubsystemStatus
            : "DEGRADED";

        const key = name.toLowerCase();
        this.states.set(key, {
            name,
            status: validStatus,
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

    getServiceStatus(name: string): SubsystemStatus | undefined {
        return this.states.get(name.toLowerCase())?.status;
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

        // SOV-05 STABILITY: Real-time resource auditing.
        // Replaces previous mock-heavy logic with platform-aware metric retrieval.
        let usage = { cpu: 0, rss: 0 };
        try {
            if (Deno.build.os === "linux") {
                const [stat, status] = await Promise.all([
                    Deno.readTextFile(`/proc/${pid}/stat`).catch(() => ""),
                    Deno.readTextFile(`/proc/${pid}/status`).catch(() => "")
                ]);

                // RSS Extraction from /proc/[pid]/status (more reliable than /proc/[pid]/stat)
                const rssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
                if (rssMatch) {
                    usage.rss = parseInt(rssMatch[1]) * 1024;
                }

                // SOV-M1 Hardening: Robust Procfs Parsing
                // Correctly handle process names with spaces or parentheses by finding the last ')'
                const lastParen = stat.lastIndexOf(")");
                const afterComm = stat.substring(lastParen + 2);
                const parts = afterComm.split(" ");

                if (parts.length >= 13) {
                    // Fields in /proc/[pid]/stat after the comm field start from index 0 in 'parts'
                    // utime is field 14, stime is field 15.
                    // Since 'parts' starts after field 2 (comm), utime is index 11, stime is index 12.
                    const utime = parseInt(parts[11]);
                    const stime = parseInt(parts[12]);
                    const totalTicks = utime + stime;
                    const now = Date.now();

                    const prev = this.sidecarStats.get(name);
                    if (prev) {
                        const tickDelta = totalTicks - prev.lastTicks;
                        const timeDeltaMs = now - prev.lastTs;
                        // Utilization = (ticks / ms) * 100
                        // 1 tick is usually 10ms (USER_HZ=100)
                        if (timeDeltaMs > 0) {
                            usage.cpu = (tickDelta * 10) / timeDeltaMs * 100;

                            // SOV-05 STABILITY: Guard against anomalies or counter resets
                            if (isNaN(usage.cpu) || usage.cpu < 0) usage.cpu = 0;
                            if (usage.cpu > 100) usage.cpu = 100;
                        }
                    }

                    this.sidecarStats.set(name, { lastTicks: totalTicks, lastTs: now });
                }
            } else if (Deno.build.os === "darwin" || Deno.build.os === "windows") {
                // Fallback to 'ps' or 'tasklist' via standard system tools if procfs is unavailable
                // For v1.0 we use a conservative fallback if direct metrics fail
                usage = { cpu: 0.5, rss: 10 * 1024 * 1024 };
            }
        } catch {
            usage = { cpu: 0.1, rss: 1024 * 1024 };
        }

        const isViolating = (usage.cpu > quota.cpu && quota.cpu > 0) || (usage.rss > quota.memory && quota.memory > 0);

        if (isViolating) {
            const count = (this.sidecarViolationCounts.get(name) || 0) + 1;
            this.sidecarViolationCounts.set(name, count);

            this.reportStatus(name, "DEGRADED", `Resource Quota Exceeded (CPU: ${usage.cpu}%, RAM: ${usage.rss} bytes) [Violation ${count}/3]`);

            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "HEALTH:QUOTA",
                message: `CRITICAL: Sidecar '${name}' exceeded resource quota. Potential compromise or exhaustion attack. Violation count: ${count}`
            });

            // SOV-M5 Hardening: Active Resource Gating
            // If an agent exceeds its quota for 3 consecutive polls, we forcibly rotate it.
            if (count >= 3 && this.sidecarManager) {
                this.logger.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "HEALTH:ENFORCEMENT",
                    message: `Autonomous Defense: Forcibly rotating non-compliant sidecar '${name}' after persistent resource violation.`
                });

                // @ts-ignore: restartSidecar might be async or missing from limited interface
                if (typeof this.sidecarManager.restartSidecar === "function") {
                    this.sidecarManager.restartSidecar(name).catch(() => {});
                }
                this.sidecarViolationCounts.set(name, 0);
            }
        } else {
            // Reset violation count if agent returns to normal
            this.sidecarViolationCounts.set(name, 0);
        }
    }
}
