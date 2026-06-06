import { ConfigurationPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { camouflage } from "../../app/bootstrapper.ts";

export class HardeningManager {
    constructor(
        private logging: LoggingPort
    ) {}

    async applyCamouflage() {
        await camouflage();
    }

    async dropCapabilities(config: ConfigurationPort) {
        const isLinux = Deno.build.os === "linux";
        const isProduction = config.getEnv("ENVIRONMENT") === "production";

        if (!isLinux) return;

        try {
            const { dropUnnecessaryCapabilities } = await import("./capabilities.ts");

            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "orchestrator:infra:system:hardening",
                message: "Hardening: Pruning 36 unnecessary kernel capabilities from Orchestrator via FFI/prctl..."
            });

            const success = dropUnnecessaryCapabilities();
            if (!success && isProduction) {
                throw new Error("FFI Capability drop failed. Principle of Least Privilege violated.");
            }

            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:infra:system:hardening",
                message: "Orchestrator successfully hardened. 36 capabilities dropped from bounding set."
            });
        } catch (e) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:system:hardening",
                message: `Hardening Failed: ${(e as Error).message}`
            });
        }
    }

    async applyProductionHardening(config: ConfigurationPort) {
        if (config.getEnv("ENVIRONMENT") === "production") {
            if (config.getBoolean("CTS_DEV_MODE", false)) {
                throw new Error("CRITICAL SECURITY VIOLATION: Application cannot start in PRODUCTION with CTS_DEV_MODE enabled.");
            }
            if (config.getBoolean("ALLOW_HARDWARE_BYPASS", false)) {
                throw new Error("CRITICAL SECURITY VIOLATION: Application cannot start in PRODUCTION with ALLOW_HARDWARE_BYPASS enabled.");
            }
            if (!config.getBoolean("STRICT_HARDWARE_INTEGRITY", true)) {
                throw new Error("CRITICAL SECURITY VIOLATION: Application cannot start in PRODUCTION with STRICT_HARDWARE_INTEGRITY disabled.");
            }

            if (Deno.env.get("MESH_SECRET") || Deno.env.get("API_TOKEN")) {
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:infra:system:hardening",
                    message: "SECURITY HYGIENE: Sensitive secrets found in environment variables. Migration to hardware TPM indices is recommended."
                });
            }
        }
    }

    async checkPilotSafety(config: ConfigurationPort) {
        if (!config.getBoolean("PILOT_MODE", false)) return;

        await this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:infra:system:hardening",
            message: "🛡️ PILOT SAFETY CHECK: System is running in Pilot Mode. Ensure 'scripts/emergency_off.sh' is accessible."
        });
    }
}
