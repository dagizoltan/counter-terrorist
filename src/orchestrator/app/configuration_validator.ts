import { ConfigurationPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

/**
 * ConfigurationValidator
 * SOV-M5 Hardening: Centralized validation of environment variables and security secrets.
 */
export class ConfigurationValidator {
    constructor(private logger: LoggingPort) {}

    /**
     * Validates that all required environment variables are present and meet security standards.
     */
    public validate(config: ConfigurationPort): { success: boolean; errors: string[] } {
        const errors: string[] = [];
        const requiredVars = [
            "API_TOKEN",
            "PKI_SECRET",
            "MESH_SECRET",
            "SECURE_BYPASS_TOKEN",
            "SECURE_ENVIRONMENT_TOKEN",
            "ENVIRONMENT"
        ];

        // 1. Presence Check
        for (const v of requiredVars) {
            if (!config.getEnv(v)) {
                errors.push(`Missing mandatory variable: ${v}`);
            }
        }

        // 2. Secret Complexity Checks
        this.validateSecret(config, "API_TOKEN", errors);
        this.validateSecret(config, "MESH_SECRET", errors);
        this.validateSecret(config, "PKI_SECRET", errors);

        // 3. Environment Consistency
        const env = config.getEnv("ENVIRONMENT");
        if (env === "production") {
            if (config.getEnv("STRICT_HARDWARE_INTEGRITY") !== "true") {
                errors.push("STRICT_HARDWARE_INTEGRITY must be 'true' in production.");
            }
            if (config.getEnv("ALLOW_HARDWARE_BYPASS") === "true") {
                errors.push("ALLOW_HARDWARE_BYPASS must be 'false' in production.");
            }
        }

        if (errors.length > 0) {
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "CONFIG_VALIDATOR",
                message: `Configuration Validation Failed: ${errors.join(" | ")}`
            }).catch(() => {});
        }

        return {
            success: errors.length === 0,
            errors
        };
    }

    private validateSecret(config: ConfigurationPort, key: string, errors: string[]) {
        const val = config.getEnv(key);
        if (!val) return;

        if (val.length < 32) {
            errors.push(`${key} must be at least 32 characters long.`);
        }

        const hasUpper = /[A-Z]/.test(val);
        const hasLower = /[a-z]/.test(val);
        const hasDigitOrSpecial = /[0-9\W_]/.test(val);

        if (!hasUpper || !hasLower || !hasDigitOrSpecial) {
            errors.push(`${key} complexity requirement not met (must include upper, lower, and digit/special).`);
        }
    }
}
