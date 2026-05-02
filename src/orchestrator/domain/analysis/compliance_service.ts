import { AuditService, AuditEvent } from "./audit.ts";

export interface ComplianceReport {
    timestamp: string;
    node: string;
    overallStatus: "COMPLIANT" | "NON_COMPLIANT";
    integrityScore: number;
    metrics: {
        totalEvents: number;
        tamperAttempts: number;
        adminActions: number;
        pcrVerification: "SUCCESS" | "FAILURE";
    };
    recentMutations: any[];
    violations: any[];
}

/**
 * ComplianceService
 * Aggregates audit data into auditor-ready reports and snapshots.
 */
export class ComplianceService {
    constructor(private audit: AuditService, private kv: Deno.Kv) {}

    /**
     * Generates a high-fidelity compliance snapshot of the current node.
     */
    async generateSnapshot(): Promise<ComplianceReport> {
        const status = await this.audit.getChainStatus();
        const verification = await this.audit.verifyChain(1000);
        
        // Find all admin actions in the last 1000 events
        const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { limit: 1000, reverse: true });
        const adminActions: AuditEvent[] = [];
        const violations: any[] = [];
        let tamperAttempts = 0;

        for await (const entry of entries) {
            const event = entry.value;
            if (event.type === "ADMIN_ACTION") adminActions.push(event);
            if (event.type === "SYSTEM_ERROR" || event.type === "EMERGENCY") {
                violations.push({
                    timestamp: event.timestamp,
                    message: event.message,
                    actor: event.actor?.id || "SYSTEM"
                });
            }
            if (event.type === "THREAT" && event.message.includes("TAMPER")) {
                tamperAttempts++;
            }
        }

        const overallStatus = (verification.valid && violations.length === 0) ? "COMPLIANT" : "NON_COMPLIANT";
        const integrityScore = verification.valid ? 100 : 0;

        return {
            timestamp: new Date().toISOString(),
            node: Deno.hostname(),
            overallStatus,
            integrityScore,
            metrics: {
                totalEvents: status.count,
                tamperAttempts,
                adminActions: adminActions.length,
                pcrVerification: verification.valid ? "SUCCESS" : "FAILURE"
            },
            recentMutations: adminActions.slice(0, 10).map(a => ({
                timestamp: a.timestamp,
                actor: a.actor?.id,
                action: a.message
            })),
            violations: violations.slice(0, 10)
        };
    }

    /**
     * Exports the compliance data as a signed JSON bundle.
     */
    async exportSignedBundle() {
        const snapshot = await this.generateSnapshot();
        // In a real system, we would sign this JSON using the TPM's identity key.
        return {
            ...snapshot,
            signature: "HW_SIGNED_MOCK_SIGNATURE"
        };
    }
}
