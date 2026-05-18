import { PolicyEngine, RemediationAction } from "./policy_engine.ts";
import { LogType, LogSeverity } from "@core/ports.ts";
import { ServiceContainer } from "@core/container.ts";

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
    private pendingKills: Map<string, number> = new Map();

    private readonly MAX_HISTORY_PER_SOURCE = 20;
    private readonly MAX_SOURCES = 500; // Prevent memory exhaustion DoS

    constructor(
        private services: ServiceContainer,
        private policy: PolicyEngine
    ) {
        // Automatically decay scores every 5 minutes to allow recovery
        setInterval(() => this.decayScores(), 300000);
    }

    shutdown() {
        // BUG-4.21 FIX: Clean up orphaned remediations (pending kills) on shutdown
        for (const [pidStr, timerId] of this.pendingKills.entries()) {
            clearTimeout(timerId);
            const pid = parseInt(pidStr);
            if (!isNaN(pid)) {
                this.services.protection.firewall.killProcess(pid).catch(() => {});
            }
        }
        this.pendingKills.clear();
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

        await this.services.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:autonomous_response",
            message: `Evaluating threat from ${key}. Score: ${currentScore}`
        });

        const decision = this.policy.evaluate(currentScore);

        if (this.policy.isShadowMode() && (decision.action === "BLOCK" || decision.action === "ISOLATE" || decision.action === "LOCKDOWN")) {
            await this.services.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:autonomous_response:shadow",
                message: `[SHADOW MODE] Simulation: Would have executed '${decision.action}' for ${key}. Reason: ${event.description}`
            });
            // Downgrade to WATCH for forensics capture only
            await this.executeRemediation(key, "WATCH", event);
        } else {
            await this.executeRemediation(key, decision.action, event);
        }
    }

    private decayScores() {
        for (const [source, score] of this.scores.entries()) {
            // Slowly decay score
            const newScore = Math.max(0, score - 1);

            if (newScore === 0) {
                // BUG-33: Fully clear state for sources that have recovered
                this.scores.delete(source);
                this.history.delete(source);
                this.activeRemediations.delete(source);

                this.services.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:orchestration:autonomous_response",
                    message: `Threat score for ${source} decayed to zero. Remediation state cleared.`
                });
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
        await this.services.audit.logEvent({
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
                await this.services.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:orchestration:autonomous_response",
                    message: `GLOBAL LOCKDOWN for ${source}`
                });
                await this.services.protection.firewall.lockdown();
                break;

            case "ISOLATE":
                await this.services.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:orchestration:autonomous_response",
                    message: `NODE ISOLATION for ${source}`
                });
                if (source.includes(".")) {
                    await this.services.protection.firewall.blockIp(source);
                } else {
                    await this.services.mesh.isolateNode("local");
                }
                break;

            case "BLOCK":
                await this.services.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:orchestration:autonomous_response",
                    message: `ENFORCED BLOCK for ${source}`
                });
                if (source.includes(".")) {
                    await this.services.protection.firewall.blockIp(source);
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) {
                        // Tactical Shift: Quarantine first for forensic dump, then kill
                        await this.services.protection.firewall.quarantineProcess(pid);
                        
                        // Extract and Gossip binary hash for fleet-wide blocking
                        this.services.forensicService.calculateProcessHash(pid).then(hash => {
                            if (hash) {
                                this.services.mesh.broadcastThreatHash(hash, Deno.hostname());
                            }
                        });

                        const timerId = setTimeout(() => {
                            this.pendingKills.delete(source);
                            this.services.protection.firewall.killProcess(pid).catch(() => {});
                        }, 5000);
                        this.pendingKills.set(source, timerId);
                    }
                }
                break;

            case "SHADOW":
                await this.services.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:orchestration:autonomous_response",
                    message: `SHADOW REDIRECTION for ${source}`
                });
                if (source.includes(".")) {
                    await this.services.protection.firewall.shadowBanIp(source);
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) {
                        await this.services.kernelService.blockSyscall(pid, "execve");
                    }
                }
                break;

            case "WATCH":
                // BUG-36: Implement process-level forensics for WATCH remediation
                if (source.includes(".")) {
                    this.services.protection.pcap.startCapture("any", 30, `forensics_${source}.pcap`, `host ${source}`).catch(() => {});
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) {
                        (this.services.protection.firewall as any).dumpProcess?.(pid, `./volume/storage/forensics/dump_${pid}_${Date.now()}`).catch(() => {});
                    }
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
