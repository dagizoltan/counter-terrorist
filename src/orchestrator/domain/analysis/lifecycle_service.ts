import { LoggingPort, LogSeverity, LogType, CommandPort } from "@core/ports.ts";
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
export class LifecycleService {
    private tasks: ScheduledTask[] = [];
    private timerId?: number;

    constructor(
        private commands: CommandPort,
        private logging: LoggingPort
    ) {
        this.initializeDefaultTasks();
    }

    private initializeDefaultTasks() {
        this.tasks.push({
            id: "kernel-attestation",
            agent: "scanner",
            command: "ATTEST_KERNEL",
            intervalMs: 300000, // 5 Minutes
            jitterMs: 30000
        });

        this.tasks.push({
            id: "file-integrity-baseline",
            agent: "fim",
            command: "GetStatus",
            intervalMs: 600000, // 10 Minutes
        });

        this.tasks.push({
            id: "pcap-health-check",
            agent: "pcap",
            command: "GetStatus",
            intervalMs: 60000, // 1 Minute
        });
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
        await this.commands.sendCommand("vpn", { type: "RotateKeys", id: crypto.randomUUID() });
        
        // 2. Signal Mesh Agent to rotate mTLS identity
        // await this.commands.sendCommand("mesh", { type: "RotateIdentity", id: crypto.randomUUID() });
    }
}
