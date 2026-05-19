import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType, CommandPort } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";

export interface ScheduledTask {
    id: string;
    agent: string;
    command: string;
    payload?: any;
    intervalMs: number;
    lastRun?: number;
    jitterMs?: number;
}

/**
 * LifecycleService (Sovereign Cron)
 * Manages the periodic execution of defensive tasks across the agent mesh.
 * Replaces host-level cron/systemd-timers for a truly distro-less posture.
 */
export class LifecycleService extends BaseService {
    private tasks: ScheduledTask[] = [];
    private timerId?: number;
    private kv?: Deno.Kv;
    private shadowTimer?: number;
    private lkgTimer?: number;
    private policyEngine?: any;

    constructor(
        private commands: CommandPort,
        private logging: LoggingPort
    ) {
        super();
        this.initializeDefaultTasks();
    }

    private initializeDefaultTasks() {
        this.tasks.push({
            id: "kernel-attestation",
            agent: "analyzer",
            command: "ATTEST_KERNEL",
            intervalMs: 300000, // 5 Minutes
            jitterMs: 30000
        });

        this.tasks.push({
            id: "file-integrity-baseline",
            agent: "watchfile",
            command: "GetStatus",
            intervalMs: 600000, // 10 Minutes
        });

        this.tasks.push({
            id: "pcap-health-check",
            agent: "netcap",
            command: "GetStatus",
            intervalMs: 60000, // 1 Minute
        });
    }

    public setKv(kv: Deno.Kv) {
        this.kv = kv;
    }

    public setPolicyEngine(policyEngine: any) {
        this.policyEngine = policyEngine;
    }

    public start() {
        if (this.timerId) return;
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "LIFECYCLE",
            message: "Sovereign Lifecycle Engine (Native Cron) active."
        });

        this.timerId = setInterval(() => this.tick(), 10000); // Check every 10s
    }

    public override async shutdown(): Promise<Result<void>> {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = undefined;
        }
        if (this.shadowTimer) {
            clearTimeout(this.shadowTimer);
            this.shadowTimer = undefined;
        }
        if (this.lkgTimer) {
            clearTimeout(this.lkgTimer);
            this.lkgTimer = undefined;
        }
        return ok(undefined);
    }

    private async tick() {
        const now = Date.now();
        for (const task of this.tasks) {
            const lastRun = task.lastRun || 0;
            const jitter = task.jitterMs ? (Math.random() * task.jitterMs) : 0;
            
            if (now - lastRun >= (task.intervalMs + jitter)) {
                task.lastRun = now;
                await this.executeTask(task);
            }
        }
    }

    private async executeTask(task: ScheduledTask) {
        try {
            await this.commands.sendCommand(task.agent, {
                type: task.command,
                payload: task.payload || {},
                id: crypto.randomUUID()
            });

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "LIFECYCLE",
                message: `Scheduled task executed: ${task.id} on agent ${task.agent}`
            });
        } catch (error) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.WARNING,
                caller: "LIFECYCLE",
                message: `Task execution failed: ${task.id} - ${error}`
            });
        }
    }

    public scheduleLkgSnapshot() {
        if (!this.kv) return;

        // Take a "Last Known Good" snapshot after 10 minutes of stability
        if (this.lkgTimer) clearTimeout(this.lkgTimer);
        this.lkgTimer = setTimeout(async () => {
            try {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: LogSeverity.INFO,
                    caller: "LIFECYCLE:LKG",
                    message: "System stable for 10m. Committing Last Known Good (LKG) snapshot..."
                });

                const criticalPrefixes = [["enforcement"], ["system", "config"], ["mesh", "identity"]];
                for (const prefix of criticalPrefixes) {
                    const iter = this.kv!.list({ prefix });
                    for await (const entry of iter) {
                        const lkgKey = ["lkg", ...entry.key];
                        await this.kv!.set(lkgKey, entry.value);
                    }
                }
            } catch (e) {
                console.error(`LKG Snapshot failed: ${e}`);
            }
        }, 600000); // 10 minutes
    }

    public startShadowModeTimer(config: any) {
        const shadowDuration = config.getNumber("SHADOW_MODE_DURATION_HOURS", 24);
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "LIFECYCLE:SHADOW",
            message: `Shadow Mode active for ${shadowDuration} hours. S-Grade blocks are simulated.`
        });

        this.shadowTimer = setTimeout(() => {
            if (this.policyEngine && this.policyEngine.isShadowMode()) {
                this.policyEngine.setShadowMode(false);
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "LIFECYCLE:SHADOW",
                    message: "Shadow Mode expired. System is now ARMED and enforcing S-Grade blocks."
                });
            }
        }, shadowDuration * 60 * 60 * 1000);
    }

    /**
     * Phase 3 Enhancement: Dynamic Key Rotation
     * Triggers a key rotation event across the defensive mesh.
     */
    public async rotateSovereignKeys() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "LIFECYCLE",
            message: "Initiating Periodic Key Rotation for mTLS and VPN interfaces."
        });

        // 1. Signal VPN Agent to generate new keys
        await this.commands.sendCommand("tunnel", { type: "RotateKeys", id: crypto.randomUUID() });
        
        // 2. Signal Mesh Agent to rotate mTLS identity
        // await this.commands.sendCommand("mesh", { type: "RotateIdentity", id: crypto.randomUUID() });
    }
}
