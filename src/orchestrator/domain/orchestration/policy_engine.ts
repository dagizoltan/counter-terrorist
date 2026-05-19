import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";

export type RemediationAction = "LOG" | "WATCH" | "SHADOW" | "BLOCK" | "ISOLATE" | "LOCKDOWN";

export interface ThresholdRule {
    score: number;
    action: RemediationAction;
    description: string;
}

export interface SecurityPolicy {
    version: string;
    thresholds: ThresholdRule[];
    defaultAction: RemediationAction;
    strictMode: boolean;
    shadowMode: boolean; // NEW: Simulation Mode
    publicKey?: string; // Base64 Ed25519 Public Key
}

/**
 * PolicyEngine
 * Evaluates behavioral threat scores against the Sovereign Governance Policy.
 * Implements "Policy-as-Code" for automated remediation.
 */
export class PolicyEngine extends BaseService {
    private policy: SecurityPolicy;

    constructor(
        private logging: LoggingPort,
        initialPolicy?: Partial<SecurityPolicy>
    ) {
        super();
        // Default Sovereign Policy
        this.policy = {
            version: "1.2.0",
            strictMode: Deno.env.get("STRICT_POLICY_ENFORCEMENT") === "true",
            shadowMode: Deno.env.get("SHADOW_MODE") !== "false", // Default to true for safety
            defaultAction: "LOG",
            thresholds: [
                { score: 10, action: "WATCH", description: "Increase forensic sampling rate" },
                { score: 30, action: "SHADOW", description: "Redirect to deceptive mirror world" },
                { score: 60, action: "BLOCK", description: "Local firewall IP rejection" },
                { score: 90, action: "ISOLATE", description: "Full node network isolation" },
                { score: 100, action: "LOCKDOWN", description: "Mesh-wide quorum lockdown" }
            ],
            ...initialPolicy
        };

        // BUG-37: Pre-sort thresholds for performance
        this.policy.thresholds.sort((a, b) => b.score - a.score);

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:policy_engine",
            message: `Sovereign Engine Active. Mode: ${this.policy.strictMode ? 'STRICT' : 'ADAPTIVE'} (Shadow: ${this.policy.shadowMode})`
        });
    }

    setShadowMode(value: boolean) {
        this.policy.shadowMode = value;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:policy_engine",
            message: `Shadow Mode ${value ? 'ENGAGED' : 'DISARMED'}. S-Grade blocks will now be ${value ? 'SIMULATED' : 'ENFORCED'}.`
        });
    }

    isShadowMode(): boolean {
        return this.policy.shadowMode;
    }

    /**
     * Determines the appropriate remediation action for a given threat score.
     */
    evaluate(score: number): ThresholdRule {
        // BUG-37: Use pre-sorted thresholds
        for (const rule of this.policy.thresholds) {
            if (score >= rule.score) {
                return rule;
            }
        }

        return {
            score: 0,
            action: this.policy.defaultAction,
            description: "Baseline operational state"
        };
    }

    /**
     * Dynamically updates the security policy from a manifest.
     */
    updatePolicy(newPolicy: Partial<SecurityPolicy>) {
        this.policy = { ...this.policy, ...newPolicy };
        this.policy.thresholds.sort((a, b) => b.score - a.score);

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:policy_engine",
            message: `Security Policy synchronized to v${this.policy.version}`
        });
    }

    getPolicy() {
        return { ...this.policy };
    }
}
