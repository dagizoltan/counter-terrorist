import { loggingService, LogType, LogSeverity } from "@infrastructure/system/logging.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

/**
 * SignatureService
 * Implements cryptographic integrity verification for agent binaries and signatures.
 * Uses the Orchestrator's Root of Trust (TPM) to sign updates.
 */
export class SignatureService {
    constructor(
        private executor: SystemExecutor,
        private config?: import("../../core/ports/system.ts").ConfigurationPort
    ) {}

    /**
     * Signs a binary or signature file for distribution to sidecar agents.
     */
    async signPayload(payloadPath: string): Promise<string | null> {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:protection:signature",
            message: `Signing payload for hardened delivery: ${payloadPath}`
        });

        // Simulate TPM signing if hardware bypass is enabled
        const bypass = this.config?.getBoolean("ALLOW_HARDWARE_BYPASS", false);
        if (bypass) {
            // Software-based fallback using OpenSSL
            const result = await this.executor.execute("openssl", [
                "dgst", "-sha256", "-sign", "./volume/keys/orchestrator.key",
                "-out", `${payloadPath}.sig`, payloadPath
            ]);
            return result.success ? `${payloadPath}.sig` : null;
        }

        // Real TPM signing logic would go here
        return null;
    }

    /**
     * Verifies a payload signature before execution.
     */
    async verifyPayload(payloadPath: string, signaturePath: string): Promise<boolean> {
        const result = await this.executor.execute("openssl", [
            "dgst", "-sha256", "-verify", "./volume/keys/orchestrator.pub",
            "-signature", signaturePath, payloadPath
        ]);
        
        if (result.success) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:domain:protection:signature",
                message: `Integrity verified for ${payloadPath}. Execution permitted.`
            });
            return true;
        }

        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:signature",
            message: `INTEGRITY BREACH: Signature mismatch for ${payloadPath}. Execution BLOCKED.`
        });
        return false;
    }
}
