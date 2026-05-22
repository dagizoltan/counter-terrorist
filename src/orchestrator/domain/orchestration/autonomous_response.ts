import { PolicyEngine, RemediationAction } from "./policy_engine.ts";
import { LogType, LogSeverity, LoggingPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";
import { ThreatResponseSaga } from "./sagas/threat_response_saga.ts";

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
import { SubsystemFactory } from "@core/subsystem_factory.ts";

import { BaseService } from "@core/base_service.ts";

export class AutonomousResponseEngine extends BaseService {
    private services: { logging?: LoggingPort } = {};
    private scores: Map<string, number> = new Map();
    private history: Map<string, ThreatEvent[]> = new Map();
    private activeRemediations: Map<string, { tier: RemediationTier, timestamp: string, reason: string }> = new Map();
    private decayInterval?: number;

    private readonly MAX_HISTORY_PER_SOURCE = 20;
    private readonly MAX_SOURCES = 500; // Prevent memory exhaustion DoS

    constructor(
        private saga: ThreatResponseSaga,
        private policy: PolicyEngine,
        private logging: LoggingPort
    ) {
        super();
        this.services.logging = logging;
    }

    override async init(): Promise<Result<void>> {
        if (this.initialized) return ok(undefined);
        // Automatically decay scores every 5 minutes to allow recovery
        this.decayInterval = setInterval(() => this.decayScores(), 300000);
        this.initialized = true;
        return ok(undefined);
    }

    override async shutdown(): Promise<Result<void>> {
        if (this.decayInterval) {
            clearInterval(this.decayInterval);
            this.decayInterval = undefined;
        }
        this.initialized = false;
        return ok(undefined);
    }

    /**
     * Ingests a threat event and determines the required remediation tier.
     */
    async evaluate(event: ThreatEvent): Promise<Result<void>> {
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
            caller: "orchestrator:domain:orchestration:autonomous_response",
            message: `Evaluating threat from ${key}. Score: ${currentScore}`
        });

        const decision = this.policy.evaluate(currentScore);

        if (this.policy.isShadowMode() && (decision.action === "BLOCK" || decision.action === "ISOLATE" || decision.action === "LOCKDOWN")) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:autonomous_response:shadow",
                message: `[SHADOW MODE] Simulation: Would have executed '${decision.action}' for ${key}. Reason: ${event.description}`
            });
            // Downgrade to WATCH for forensics capture only
            return await this.executeRemediation(key, "WATCH", event);
        } else {
            return await this.executeRemediation(key, decision.action, event);
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

                this.services.logging?.log({
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

    private async executeRemediation(source: string, tier: RemediationTier, trigger: ThreatEvent): Promise<Result<void>> {
        // Avoid redundant remediation for the same tier if already active
        const existing = this.activeRemediations.get(source);
        if (existing && existing.tier === tier) return ok(undefined);

        this.activeRemediations.set(source, {
            tier,
            timestamp: new Date().toISOString(),
            reason: trigger.description
        });

        const score = this.scores.get(source) || 0;
        return await this.saga.execute(source, tier, trigger, score);
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
