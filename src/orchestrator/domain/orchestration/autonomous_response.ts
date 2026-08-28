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
    data?: Record<string, unknown>;
    timestamp?: string;
}

/**
 * AutonomousResponseEngine
 * Tiered automated defense logic that escalates based on behavioral scoring.
 */
import { SubsystemFactory } from "@core/subsystem_factory.ts";

import { BaseService } from "@core/base_service.ts";
import { BoundedMap } from "../../core/utils/collections.ts";

export class AutonomousResponseEngine extends BaseService {
    private services: { logging?: LoggingPort } = {};
    private scores: BoundedMap<string, number> = new BoundedMap(500);
    private history: BoundedMap<string, ThreatEvent[]> = new BoundedMap(500);
    private activeRemediations: BoundedMap<string, { tier: RemediationTier, timestamp: string, reason: string }> = new BoundedMap(500);
    private decayInterval?: number;

    private readonly MAX_HISTORY_PER_SOURCE = 20;

    constructor(
        private saga: ThreatResponseSaga,
        private policy: PolicyEngine,
        private logging: LoggingPort
    ) {
        super();
        this.services.logging = logging;
    }

    protected override async onInit(): Promise<Result<void>> {
        // Automatically decay scores every 5 minutes to allow recovery
        this.decayInterval = setInterval(() => this.decayScores(), 300000);
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.decayInterval) {
            clearInterval(this.decayInterval);
            this.decayInterval = undefined;
        }
        return ok(undefined);
    }

    /**
     * Evaluates high-risk active socket flow telemetry and triggers automated perimeter isolation.
     */
    async evaluateSocketFlow(flow: { remoteIp: string; threatScore?: number; process?: string; pid?: number }): Promise<Result<void>> {
        if (!flow.remoteIp || typeof flow.threatScore !== "number" || flow.threatScore < 85) {
            return ok(undefined);
        }

        const threatEvent: ThreatEvent = {
            source: flow.remoteIp,
            type: "HIGH_RISK_SOCKET_FLOW",
            severity: flow.threatScore,
            description: `Automated Response: High-risk socket flow detected from ${flow.remoteIp} (Process: ${flow.process || "unattributed"}, PID: ${flow.pid || "unknown"}) with Threat Score ${flow.threatScore}`,
            data: flow as Record<string, unknown>,
            timestamp: new Date().toISOString()
        };

        return await this.evaluate(threatEvent);
    }

    /**
     * Ingests a threat event and determines the required remediation tier.
     */
    async evaluate(event: ThreatEvent): Promise<Result<void>> {
        const key = event.source;
        // Input validation: guarantee non-negative finite severity score increments
        const safeSeverity = (typeof event.severity === "number" && Number.isFinite(event.severity) && event.severity > 0)
            ? Math.floor(event.severity)
            : 0;
        const currentScore = (this.scores.get(key) || 0) + safeSeverity;

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

        const decision = this.policy.evaluate(currentScore, { ...event, currentScore });

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

    /**
     * Periodically reduces threat scores to allow for host recovery.
     */
    private decayScores() {
        // Iterate over a snapshot of entries to safely handle deletions
        for (const [source, score] of Array.from(this.scores.entries())) {
            const currentScore = Number.isFinite(score) ? score : 0;
            const newScore = Math.max(0, currentScore - 1);

            if (newScore === 0) {
                this.scores.delete(source);
                this.history.delete(source);
                this.activeRemediations.delete(source);

                this.logging.log({
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
