import { LogType, LogSeverity, FirewallPort, MeshPort, CommandPort, PcapPort, LoggingPort } from "@core/ports.ts";
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
export class ThreatResponseSaga {
    constructor(private deps: SagaDependencies) {}

    async execute(source: string, tier: RemediationTier, trigger: ThreatEvent, totalScore: number): Promise<Result<void>> {
        const auditMsg = `Remediation Tier [${tier}] engaged for ${source}. Reason: ${trigger.type}`;
        await this.deps.audit.logEvent({
            type: LogType.AUDIT,
            message: auditMsg,
            data: { source, tier, trigger, totalScore }
        });

        try {
            switch (tier) {
                case "LOCKDOWN":
                    return await this.handleLockdown(source);

                case "ISOLATE":
                    return await this.handleIsolation(source);

                case "BLOCK":
                    return await this.handleBlock(source, trigger);

                case "SHADOW":
                    return await this.handleShadow(source);

                case "WATCH":
                    return await this.handleWatch(source);

                case "LOG":
                default:
                    return ok(undefined);
            }
        } catch (e) {
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
            const res = await this.deps.firewall.blockIp(source);
            return res.success ? ok(undefined) : err(new Error(res.stderr));
        } else {
            const res = await this.deps.mesh.isolateNode("local");
            return res.success ? ok(undefined) : err(new Error("Mesh isolation failed"));
        }
    }

    private async handleBlock(source: string, trigger: ThreatEvent): Promise<Result<void>> {
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
                this.deps.forensics.calculateProcessHash(pid).then(hash => {
                    if (hash) {
                        this.deps.mesh.broadcastThreatHash(hash, Deno.hostname());
                    }
                });

                // 3. Delayed kill to allow forensics to complete
                setTimeout(() => {
                    this.deps.firewall.killProcess(pid).catch(() => {});
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
            message: `SHADOW REDIRECTION for ${source}`
        });

        if (source.includes(".")) {
            const res = await this.deps.firewall.shadowBanIp(source);
            return res.success ? ok(undefined) : err(new Error(res.stderr));
        } else {
            const pid = parseInt(source);
            if (!isNaN(pid)) {
                const res = await this.deps.kernel.blockSyscall(pid, "execve");
                return res;
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
                (this.deps.firewall as any).dumpProcess?.(pid, `./volume/storage/forensics/dump_${pid}_${Date.now()}`).catch(() => {});
            }
        }
        return ok(undefined);
    }
}
