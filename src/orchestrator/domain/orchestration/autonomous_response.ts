import { PolicyEngine, RemediationAction } from "./policy_engine.ts";
import { ForensicService } from "../analysis/forensic_service.ts";
import { MeshManager } from "./mesh.ts";
import { AuditService } from "../analysis/audit.ts";
import { NotificationService } from "../analysis/notifications.ts";
import { ProtectionPort, LoggingPort, SyslogSeverity, LogType, LogSeverity } from "@core/ports.ts";

export type RemediationTier = RemediationAction;

export interface ThreatEvent {
    source: string; // IP or PID
    type: string;
    severity: number;
    description: string;
    data?: any;
    timestamp?: string;
}

/**
 * AutonomousResponseEngine
 * Tiered automated defense logic that escalates based on behavioral scoring.
 */
export class AutonomousResponseEngine {
    private scores: Map<string, number> = new Map();
    private history: Map<string, ThreatEvent[]> = new Map();
    private activeRemediations: Map<string, { tier: RemediationTier, timestamp: string, reason: string }> = new Map();
    
    private readonly MAX_HISTORY_PER_SOURCE = 20;
    private readonly MAX_SOURCES = 500; // Prevent memory exhaustion DoS

    constructor(
        private policy: PolicyEngine,
        private protection: ProtectionPort,
        private kernel: any, // KernelService
        private mesh: MeshManager,
        private notifications: NotificationService,
        private audit: AuditService,
        private forensics: ForensicService,
        private logging: LoggingPort
    ) {
        // Automatically decay scores every 5 minutes to allow recovery
        setInterval(() => this.decayScores(), 300000);
    }

    /**
     * Ingests a threat event and determines the required remediation tier.
     */
    async evaluate(event: ThreatEvent) {
        const key = event.source;
        const currentScore = (this.scores.get(key) || 0) + event.severity;
        
        // Prevent map explosion (State Exhaustion Protection)
        if (!this.scores.has(key) && this.scores.size >= this.MAX_SOURCES) {
            const oldest = Array.from(this.scores.keys())[0];
            this.scores.delete(oldest);
            this.history.delete(oldest);
            this.activeRemediations.delete(oldest);
        }

        this.scores.set(key, currentScore);
        
        let events = this.history.get(key) || [];
        event.timestamp = event.timestamp || new Date().toISOString();
        events.push(event);
        
        // Limit history to prevent memory bloat
        if (events.length > this.MAX_HISTORY_PER_SOURCE) {
            events = events.slice(-this.MAX_HISTORY_PER_SOURCE);
        }
        this.history.set(key, events);

        await this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "AUTONOMOUS",
            message: `Evaluating threat from ${key}. Score: ${currentScore}`
        });

        const decision = this.policy.evaluate(currentScore);
        await this.executeRemediation(key, decision.action, event);
    }

    private decayScores() {
        for (const [source, score] of this.scores.entries()) {
            if (score <= 0) {
                this.scores.delete(source);
                continue;
            }
            // Slowly decay score
            const newScore = Math.max(0, score - 1);
            if (newScore === 0) {
                this.scores.delete(source);
                this.history.delete(source);
            } else {
                this.scores.set(source, newScore);
            }
        }
    }

    private async executeRemediation(source: string, tier: RemediationTier, trigger: ThreatEvent) {
        // Avoid redundant remediation for the same tier if already active
        const existing = this.activeRemediations.get(source);
        if (existing && existing.tier === tier) return;

        const auditMsg = `Remediation Tier [${tier}] engaged for ${source}. Reason: ${trigger.type}`;
        await this.audit.logEvent({
            type: LogType.AUDIT,
            message: auditMsg,
            data: { source, tier, trigger, totalScore: this.scores.get(source) }
        });

        this.activeRemediations.set(source, {
            tier,
            timestamp: new Date().toISOString(),
            reason: trigger.description
        });

        switch (tier) {
            case "LOCKDOWN":
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "AUTONOMOUS",
                    message: `GLOBAL LOCKDOWN for ${source}`
                });
                await this.protection.firewall.lockdown();
                break;

            case "ISOLATE":
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "AUTONOMOUS",
                    message: `NODE ISOLATION for ${source}`
                });
                if (source.includes(".")) {
                    await this.protection.firewall.blockIp(source);
                } else {
                    await this.mesh.isolateNode("local");
                }
                break;

            case "BLOCK":
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "AUTONOMOUS",
                    message: `ENFORCED BLOCK for ${source}`
                });
                if (source.includes(".")) {
                    await this.protection.firewall.blockIp(source);
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) {
                        // Tactical Shift: Quarantine first for forensic dump, then kill
                        await this.protection.firewall.quarantineProcess(pid);
                        
                        // Extract and Gossip binary hash for fleet-wide blocking
                        this.forensics.calculateProcessHash(pid).then(hash => {
                            if (hash) {
                                this.mesh.broadcastThreatHash(hash, Deno.hostname());
                            }
                        });

                        setTimeout(() => this.protection.firewall.killProcess(pid).catch(() => {}), 5000);
                    }
                }
                break;

            case "SHADOW":
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "AUTONOMOUS",
                    message: `SHADOW REDIRECTION for ${source}`
                });
                if (source.includes(".")) {
                    await this.protection.firewall.shadowBanIp(source);
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) {
                        await this.kernel.blockSyscall(pid, "execve");
                    }
                }
                break;

            case "WATCH":
                if (source.includes(".")) {
                    this.protection.pcap.startCapture("any", 30, `forensics_${source}.pcap`, `host ${source}`).catch(() => {});
                }
                break;
                
            case "LOG":
            default:
                break;
        }
    }

    /**
     * Returns current tactical intelligence for UI consumption.
     */
    getTacticalIntelligence() {
        const scores = Array.from(this.scores.entries()).map(([source, score]) => ({
            source,
            score,
            events: (this.history.get(source) || []).slice(-5), // Last 5 events
            remediation: this.activeRemediations.get(source)
        }));

        // Sort by highest score
        return scores.sort((a, b) => b.score - a.score);
    }

    resetScore(source: string) {
        this.scores.delete(source);
        this.history.delete(source);
        this.activeRemediations.delete(source);
    }
}
