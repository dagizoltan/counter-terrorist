import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { BaseService } from "@core/base_service.ts";

/**
 * SystemLifecycleService
 * Centralizes host-level management, hardware integrity, and orchestrator safety.
 * Decouples the SovereignApp from low-level runtime concerns.
 */
export class SystemLifecycleService extends BaseService {
    private isShuttingDown = false;
    private signalListeners: Map<Deno.Signal, () => Promise<void>> = new Map();

    constructor(
        private logging: LoggingPort,
        private tpm: TPMManager,
        private kv: Deno.Kv
    ) {
        super();
    }

    override async init(): Promise<import("../../core/result.ts").Result<void>> {
        if (this.initialized) return { success: true, data: undefined };
        this.initialized = true;
        return { success: true, data: undefined };
    }

    override async shutdown(): Promise<import("../../core/result.ts").Result<void>> {
        this.initialized = false;
        return await super.shutdown();
    }

    /**
     * Performs a crash-loop detection by checking recent boot attempts.
     */
    async checkCrashLoop(): Promise<boolean> {
        try {
            const tempKv = await Deno.openKv("./volume/storage/boot_counter.db");
            const key = ["boot", "last_attempt"];
            const entry = await tempKv.get<any>(key);
            const now = Date.now();

            let count = 1;
            if (entry.value && (now - entry.value.timestamp < 300000)) { // 5 minutes
                count = (entry.value.count || 0) + 1;
            }

            await tempKv.set(key, { count, timestamp: now });
            tempKv.close();

            return count >= 3;
        } catch {
            return false;
        }
    }

    /**
     * Verifies system hardware integrity against "golden" PCR values.
     */
    async verifyHardware(config: ConfigurationPort): Promise<boolean> {
        const goldenPcrs: Record<number, string> = {};
        for (const [key, value] of Object.entries(Deno.env.toObject())) {
            if (key.startsWith("TPM_GOLDEN_PCR_")) {
                const index = parseInt(key.replace("TPM_GOLDEN_PCR_", ""));
                if (!isNaN(index)) goldenPcrs[index] = value;
            }
        }

        const isHardwareSecure = await this.tpm.verifyIntegrity(goldenPcrs);
        const bypassToken = config.getEnv("SECURE_ENVIRONMENT_TOKEN");
        const secureBypass = config.getEnv("SECURE_BYPASS_TOKEN");

        const isValidBypass = secureBypass &&
                             secureBypass.length >= 32 &&
                             (await secureCompare(bypassToken, secureBypass)) &&
                             config.getEnv("ENVIRONMENT") !== "production";

        if (!isHardwareSecure && !isValidBypass) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "LIFECYCLE:SECURITY",
                message: "CRITICAL: HARDWARE INTEGRITY FAILURE. Access denied. No valid/secure bypass token provided."
            });
            return false;
        }

        if (!isHardwareSecure && isValidBypass) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "LIFECYCLE:SECURITY",
                message: "WARNING: RUNNING IN UNSAFE BYPASS MODE. System integrity is NOT hardware-verified."
            });
        }

        return true;
    }

    /**
     * Registers handlers for graceful shutdown on system signals.
     */
    registerSignalHandlers(cleanup: () => Promise<void>) {
        const wrapper = async () => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "LIFECYCLE:SYSTEM",
                message: "Initiating graceful shutdown sequence..."
            });

            await cleanup();
            Deno.exit(0);
        };

        ["SIGINT", "SIGTERM"].forEach(s => {
            try {
                const sig = s as Deno.Signal;
                Deno.addSignalListener(sig, wrapper);
                this.signalListeners.set(sig, wrapper);
            } catch {}
        });
    }

    /**
     * Unregisters signal listeners (useful for testing).
     */
    unregisterSignalHandlers() {
        for (const [sig, handler] of this.signalListeners.entries()) {
            try { Deno.removeSignalListener(sig, handler); } catch {}
        }
        this.signalListeners.clear();
    }

    /**
     * Attempts to restore system state from a 'Last Known Good' snapshot.
     */
    async tryRestoreLkg() {
        try {
            const iter = this.kv.list({ prefix: ["lkg"] });
            let restoredCount = 0;
            for await (const entry of iter) {
                const targetKey = entry.key.slice(1); // Remove "lkg" prefix
                await this.kv.set(targetKey, entry.value);
                restoredCount++;
            }

            if (restoredCount > 0) {
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "LIFECYCLE:LKG",
                    message: `✅ AUTO-RESTORE: Successfully restored ${restoredCount} records from LKG snapshot.`
                });
            }
        } catch (e) {
            console.error(`LKG Restore failed: ${e}`);
        }
    }
}
