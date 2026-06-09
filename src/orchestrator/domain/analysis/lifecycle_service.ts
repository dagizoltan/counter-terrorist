import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType, CommandPort, ConfigurationPort } from "@core/ports.ts";
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

export class LifecycleService extends BaseService {
    private tasks: ScheduledTask[] = [];
    private customTasks: (() => Promise<void>)[] = [];
    private timerId?: any;
    private kv?: Deno.Kv;
    private shadowTimer?: any;
    private lkgTimer?: any;
    private policyEngine?: import("../orchestration/policy_engine.ts").PolicyEngine;

    constructor(private commands: CommandPort, private logging: LoggingPort) {
        super();
        this.initializeDefaultTasks();
    }

    private initializeDefaultTasks() {
        this.tasks.push({ id: "kernel-attestation", agent: "analyzer", command: "ATTEST_KERNEL", intervalMs: 300000, jitterMs: 30000 });
        this.tasks.push({ id: "file-integrity-baseline", agent: "watchfile", command: "GetStatus", intervalMs: 600000 });
        this.tasks.push({ id: "pcap-health-check", agent: "netcap", command: "GetStatus", intervalMs: 60000 });
    }

    public setKv(kv: Deno.Kv) {
        this.kv = kv;
        this.scheduleLkgSnapshot();
    }
    public setPolicyEngine(policyEngine: import("../orchestration/policy_engine.ts").PolicyEngine) {
        this.policyEngine = policyEngine;
        this.scheduleShadowModeCheck();
    }
    public start() {
        if (this.timerId) return;
        this.timerId = setInterval(() => this.tick(), 10000);
    }

    private scheduleShadowModeCheck() {
        if (this.shadowTimer) clearInterval(this.shadowTimer);
        this.shadowTimer = setInterval(() => {
            if (this.policyEngine?.isShadowMode()) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "LIFECYCLE:SHADOW",
                    message: "REMINDER: System remains in SHADOW MODE. Active enforcement is disabled."
                });
            }
        }, 3600000); // Hourly reminder
    }

    public startShadowModeTimer(config: ConfigurationPort) {
        this.scheduleShadowModeCheck();
    }

    public scheduleLkgSnapshot() {
        if (this.lkgTimer) clearInterval(this.lkgTimer);
        this.lkgTimer = setInterval(async () => {
            if (!this.kv) return;
            try {
                const iter = this.kv.list({ prefix: [] });
                let count = 0;
                let batch = this.kv.atomic();
                for await (const entry of iter) {
                    if (entry.key[0] === "lkg") continue;
                    batch.set(["lkg", ...entry.key], entry.value);
                    count++;
                    if (count % 100 === 0) {
                        await batch.commit();
                        batch = this.kv.atomic();
                    }
                }
                await batch.commit();
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: LogSeverity.INFO,
                    caller: "LIFECYCLE:LKG",
                    message: `Last Known Good snapshot created (${count} keys).`
                });
            } catch (e) {
                console.error("LKG snapshot failed:", e);
            }
        }, 43200000); // 12 hours
    }

    protected override async onInit(): Promise<Result<void>> { return ok(undefined); }
    protected override async onShutdown(): Promise<Result<void>> {
        if (this.timerId) clearInterval(this.timerId);
        if (this.shadowTimer) clearInterval(this.shadowTimer);
        if (this.lkgTimer) clearInterval(this.lkgTimer);
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
        for (const ct of this.customTasks) {
            await ct().catch(e => console.error(`Custom lifecycle task failed: ${e}`));
        }
    }

    private async executeTask(task: ScheduledTask) {
        try {
            await this.commands.sendCommand(task.agent, { type: task.command, payload: task.payload || {}, id: crypto.randomUUID() });
        } catch (error) {
            this.logging.log({ timestamp: new Date().toISOString(), type: LogType.ACTIVITY, severity: LogSeverity.WARNING, caller: "LIFECYCLE", message: `Task failed: ${task.id} - ${error}` });
        }
    }

    public addCustomTask(task: () => Promise<void>) { this.customTasks.push(task); }
    public async rotateSovereignKeys() {
        await this.commands.sendCommand("tunnel", { type: "RotateKeys", id: crypto.randomUUID() });
    }
}
