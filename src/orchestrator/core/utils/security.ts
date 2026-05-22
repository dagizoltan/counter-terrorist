/**
 * SecretRedactor
 * Utility to mask sensitive configuration values in logs and telemetry.
 */
export class SecretRedactor {
    private sensitiveValues: Set<string> = new Set();

    constructor(config?: Record<string, string | undefined>) {
        if (config) {
            this.updateSecrets(config);
        }
    }

    /**
     * Updates the set of sensitive values to redact.
     * Only adds values that are at least 8 characters long to avoid over-redaction.
     */
    updateSecrets(config: Record<string, string | undefined>) {
        const sensitiveKeys = ["API_TOKEN", "MESH_SECRET", "PKI_SECRET", "SECURE_BYPASS_TOKEN"];
        for (const key of sensitiveKeys) {
            const val = config[key];
            if (val && val.length >= 8) {
                this.sensitiveValues.add(val);
            }
        }
    }

    /**
     * Redacts sensitive values from a string.
     */
    redact(text: string): string {
        if (typeof text !== "string") return String(text);
        let redacted = text;
        for (const secret of this.sensitiveValues) {
            // Escape special regex characters in the secret
            const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            redacted = redacted.replace(regex, "[REDACTED]");
        }
        return redacted;
    }

    /**
     * Deeply redacts sensitive values from an object.
     */
    redactObject(obj: any): any {
        if (!obj) return obj;
        if (typeof obj === "string") return this.redact(obj);
        if (Array.isArray(obj)) return obj.map(i => this.redactObject(i));
        if (typeof obj === "object") {
            const result: Record<string, any> = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.redactObject(value);
            }
            return result;
        }
        return obj;
    }
}
