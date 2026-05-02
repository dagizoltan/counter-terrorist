import { ProtectionPort, LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { NotificationService } from "../analysis/notifications.ts";
import { MeshManager } from "./mesh.ts";
import { AuditService } from "../analysis/audit.ts";

export type RemediationTier = "PASSIVE" | "TACTICAL" | "EMERGENCY";

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
    
    // Configurable thresholds
    private readonly TACTICAL_THRESHOLD = 3;
    private readonly EMERGENCY_THRESHOLD = 10;

    constructor(
        private protection: ProtectionPort,
        private mesh: MeshManager,
        private notifications: NotificationService,
        private audit: AuditService,
        private logging: LoggingPort
    ) {}

    /**
     * Ingests a threat event and determines the required remediation tier.
     */
    async evaluate(event: ThreatEvent) {
        const key = event.source;
        const currentScore = (this.scores.get(key) || 0) + event.severity;
        this.scores.set(key, currentScore);
        
        const events = this.history.get(key) || [];
        event.timestamp = event.timestamp || new Date().toISOString();
        events.push(event);
        this.history.set(key, events);

        await this.logging.log(`[AUTONOMOUS] Evaluating threat from ${key}. Score: ${currentScore}`, SyslogSeverity.DEBUG);

        if (currentScore >= this.EMERGENCY_THRESHOLD) {
            await this.executeRemediation(key, "EMERGENCY", event);
        } else if (currentScore >= this.TACTICAL_THRESHOLD) {
            await this.executeRemediation(key, "TACTICAL", event);
        } else {
            await this.executeRemediation(key, "PASSIVE", event);
        }
    }

    private async executeRemediation(source: string, tier: RemediationTier, trigger: ThreatEvent) {
        // Avoid redundant remediation for the same tier if already active
        const existing = this.activeRemediations.get(source);
        if (existing && existing.tier === tier) return;

        const auditMsg = `Remediation Tier [${tier}] engaged for ${source}. Reason: ${trigger.type}`;
        await this.audit.logEvent({
            type: "REMEDIATION",
            message: auditMsg,
            data: { source, tier, trigger, totalScore: this.scores.get(source) }
        });

        this.activeRemediations.set(source, {
            tier,
            timestamp: new Date().toISOString(),
            reason: trigger.description
        });

        switch (tier) {
            case "EMERGENCY":
                await this.logging.log(`[AUTONOMOUS] EMERGENCY ISOLATION for ${source}`, SyslogSeverity.EMERGENCY);
                if (source.includes(".")) {
                    await this.protection.firewall.blockIp(source);
                } else {
                    await this.mesh.isolateNode("local");
                }
                await this.notifications.notify({
                    type: "CRITICAL",
                    message: `CRITICAL: Autonomous Emergency Isolation engaged for ${source}`
                });
                break;

            case "TACTICAL":
                await this.logging.log(`[AUTONOMOUS] TACTICAL RESPONSE for ${source}`, SyslogSeverity.CRITICAL);
                if (source.includes(".")) {
                    try {
                        await (this.protection as any).firewall.sendCommand("ebpf", {
                            type: "SHADOW_BAN",
                            ip: source
                        });
                    } catch {
                        await this.protection.firewall.blockIp(source);
                    }
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) await this.protection.firewall.killProcess(pid);
                }
                break;

            case "PASSIVE":
                if (source.includes(".")) {
                    this.protection.pcap.startCapture("any", 30, `forensics_${source}.pcap`, `host ${source}`).catch(() => {});
                }
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
