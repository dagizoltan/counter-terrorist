import { LogType, LogSeverity, FirewallPort, MeshPort, PcapPort, LoggingPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";
import { ThreatEvent, RemediationTier } from "../autonomous_response.ts";
import { AuditService } from "../../analysis/audit.ts";
import { ForensicService } from "../../analysis/forensic_service.ts";
import { KernelService } from "../../protection/kernel_service.ts";

export interface SagaDependencies {
    firewall: FirewallPort;
    mesh: MeshPort;
    kernel: KernelService;
    pcap: PcapPort;
    audit: AuditService;
    forensics: ForensicService;
    logging: LoggingPort;
}

/**
 * ThreatResponseSaga
 * Coordinates complex, multi-stage defensive responses to detected threats.
 * Decouples coordination logic from pure behavioral assessment.
 */
export enum SagaState {
    PENDING = "PENDING",
    EXECUTING = "EXECUTING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    ROLLED_BACK = "ROLLED_BACK"
}

export interface SagaInstance {
    id: string;
    source: string;
    tier: RemediationTier;
    state: SagaState;
    steps: string[];
    timestamp: string;
}

/**
 * ThreatResponseSaga
 * Coordinates complex, multi-stage defensive responses to detected threats.
 * Decouples coordination logic from pure behavioral assessment.
 */
export class ThreatResponseSaga {
    private activeSagas: Map<string, SagaInstance> = new Map();

    constructor(private deps: SagaDependencies) {}

    async execute(source: string, tier: RemediationTier, trigger: ThreatEvent, totalScore: number): Promise<Result<void>> {
        const sagaId = crypto.randomUUID();
        const instance: SagaInstance = {
            id: sagaId,
            source,
            tier,
            state: SagaState.PENDING,
            steps: [],
            timestamp: new Date().toISOString()
        };
        this.activeSagas.set(sagaId, instance);

        const auditMsg = `Saga [${sagaId.slice(0, 8)}] Remediation Tier [${tier}] engaged for ${source}. Reason: ${trigger.type}`;
        await this.deps.audit.logEvent({
            type: LogType.AUDIT,
            message: auditMsg,
            data: { source, tier, trigger, totalScore }
        });

        instance.state = SagaState.EXECUTING;

        try {
            let result: Result<void>;
            switch (tier) {
                case "LOCKDOWN":
                    result = await this.handleLockdown(source);
                    break;

                case "ISOLATE":
                    result = await this.handleIsolation(source);
                    break;

                case "BLOCK":
                    result = await this.handleBlock(source, trigger);
                    break;

                case "SHADOW":
                    result = await this.handleShadow(source);
                    break;

                case "WATCH":
                    result = await this.handleWatch(source);
                    break;

                case "LOG":
                default:
                    result = ok(undefined);
            }

            if (result.success) {
                instance.state = SagaState.COMPLETED;
            } else {
                instance.state = SagaState.FAILED;
            }
            return result;

        } catch (e) {
            instance.state = SagaState.FAILED;
            const error = e instanceof Error ? e : new Error(String(e));
            this.deps.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:saga:threat_response",
                message: `Saga execution failed for ${source}: ${error.message}`
            });
            return err(error);
        }
    }

    private async handleLockdown(source: string): Promise<Result<void>> {
        this.deps.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:saga:threat_response",
            message: `GLOBAL LOCKDOWN for ${source}`
        });
        const res = await this.deps.firewall.lockdown();
        return res.success ? ok(undefined) : err(new Error(res.stderr));
    }

    private async handleIsolation(source: string): Promise<Result<void>> {
        this.deps.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:saga:threat_response",
            message: `NODE ISOLATION for ${source}`
        });

        if (source.includes(".")) {
            // Mesh-wide IP Quarantine propagation
            await this.deps.mesh.broadcastQuarantine?.(source);
            const res = await this.deps.firewall.blockIp(source);
            return res.success ? ok(undefined) : err(new Error(res.stderr));
        } else {
            const res = await this.deps.mesh.isolateNode("local");
            return res.success ? ok(undefined) : err(new Error("Mesh isolation failed"));
        }
    }

    private async handleBlock(source: string, _trigger: ThreatEvent): Promise<Result<void>> {
        this.deps.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:saga:threat_response",
            message: `ENFORCED BLOCK for ${source}`
        });

        if (source.includes(".")) {
            const res = await this.deps.firewall.blockIp(source);
            return res.success ? ok(undefined) : err(new Error(res.stderr));
        } else {
            const pid = parseInt(source);
            if (!isNaN(pid)) {
                // 1. Quarantine first for forensic dump
                await this.deps.firewall.quarantineProcess(pid);

                // 2. Extract and Gossip binary hash for fleet-wide blocking
                try {
                    const hash = await this.deps.forensics.calculateProcessHash(pid);
                    if (hash) {
                        const res = await this.deps.mesh.broadcastThreatHash(hash, Deno.hostname());
                        if (!res.success) {
                            this.deps.logging.log({
                                timestamp: new Date().toISOString(),
                                type: LogType.GENERIC,
                                severity: LogSeverity.WARNING,
                                caller: "orchestrator:saga:threat_response:gossip",
                                message: `Failed to broadcast threat hash for PID ${pid}: ${res.error.message}`
                            });
                        }
                    }
                } catch (err) {
                    this.deps.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:saga:threat_response:forensics",
                        message: `Failed to calculate process hash for PID ${pid}: ${err instanceof Error ? err.message : String(err)}`
                    });
                }

                // 3. Delayed kill to allow forensics to complete
                setTimeout(() => {
                    this.deps.firewall.killProcess(pid).catch((killErr) => {
                        this.deps.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.GENERIC,
                            severity: LogSeverity.WARNING,
                            caller: "orchestrator:saga:threat_response:kill",
                            message: `Failed to kill PID ${pid}: ${killErr instanceof Error ? killErr.message : String(killErr)}`
                        });
                    });
                }, 5000);

                return ok(undefined);
            }
        }
        return err(new Error(`Invalid source for BLOCK: ${source}`));
    }

    private async handleShadow(source: string): Promise<Result<void>> {
        this.deps.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:saga:threat_response",
            message: `SHADOW REDIRECTION/ADAPTIVE LSM for ${source}`
        });

        if (source.includes(".")) {
            const res = await this.deps.firewall.shadowBanIp(source);
            return res.success ? ok(undefined) : err(new Error(res.stderr));
        } else {
            const pid = parseInt(source);
            if (!isNaN(pid)) {
                // Adaptive LSM: Tighten syscall allowlist for the process
                // In shadow mode, we allow basic I/O but block high-risk calls.
                const res = await this.deps.firewall.sendCommand!("sentinel", {
                    type: "LSM_SYSCALL_ALLOWLIST",
                    pid,
                    allowed_syscalls: ["open", "openat", "read", "write", "close"]
                });
                return res.success ? ok(undefined) : err(new Error(res.stderr));
            }
        }
        return err(new Error(`Invalid source for SHADOW: ${source}`));
    }

    private async handleWatch(source: string): Promise<Result<void>> {
        if (source.includes(".")) {
            await this.deps.pcap.startCapture("any", 30, `forensics_${source}.pcap`, `host ${source}`);
        } else {
            const pid = parseInt(source);
            if (!isNaN(pid)) {
                (this.deps.firewall as unknown as { dumpProcess?: (pid: number, path: string) => Promise<void> }).dumpProcess?.(pid, `./volume/storage/forensics/dump_${pid}_${Date.now()}`).catch(() => {});
            }
        }
        return ok(undefined);
    }
}
