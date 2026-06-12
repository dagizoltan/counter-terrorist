import { ok } from "@core/result.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { PolicyDSL, Rule } from "./policy_dsl.ts";

export type RemediationAction = "LOG" | "WATCH" | "SHADOW" | "BLOCK" | "ISOLATE" | "LOCKDOWN";

export interface ThresholdRule {
    score: number;
    action: RemediationAction;
    description: string;
}

export interface SecurityPolicy {
    version: string;
    thresholds: ThresholdRule[];
    rules: Rule[]; // NEW: Structured DSL Rules
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
    private dsl: PolicyDSL = new PolicyDSL();

    constructor(
        private logging: LoggingPort,
        private config: import("../../core/ports/system.ts").ConfigurationPort,
        initialPolicy?: Partial<SecurityPolicy>
    ) {
        super();
        // Default Sovereign Policy
        this.policy = {
            version: "1.2.0",
            strictMode: config.getEnv("STRICT_POLICY_ENFORCEMENT") === "true",
            shadowMode: config.getEnv("SHADOW_MODE") !== "false", // Default to true for safety
            defaultAction: "LOG",
            thresholds: [
                { score: 10, action: "WATCH", description: "Increase forensic sampling rate" },
                { score: 30, action: "SHADOW", description: "Redirect to deceptive mirror world" },
                { score: 60, action: "BLOCK", description: "Local firewall IP rejection" },
                { score: 90, action: "ISOLATE", description: "Full node network isolation" },
                { score: 100, action: "LOCKDOWN", description: "Mesh-wide quorum lockdown" }
            ],
            rules: [],
            ...initialPolicy
        };

        // BUG-37: Pre-sort thresholds for performance
        this.policy.thresholds.sort((a, b) => b.score - a.score);
    }

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:policy_engine",
            message: `Sovereign Engine Active. Mode: ${this.policy.strictMode ? 'STRICT' : 'ADAPTIVE'} (Shadow: ${this.policy.shadowMode})`
        });
        return { success: true, data: undefined };
    }

    protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
        return ok(undefined);
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
     * Determines the appropriate remediation action for a given threat score and context.
     */
    evaluate(score: number, context?: Record<string, any>): ThresholdRule {
        // 1. Evaluate DSL Rules first (Context-Aware)
        if (context && this.policy.rules.length > 0) {
            const matchedRule = this.dsl.evaluate(this.policy.rules, { ...context, score });
            if (matchedRule) {
                return {
                    score: matchedRule.priority, // Use priority as indicative score
                    action: matchedRule.action,
                    description: `DSL Match: ${matchedRule.name} - ${matchedRule.description}`
                };
            }
        }

        // 2. Fallback to Threshold-based evaluation
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
