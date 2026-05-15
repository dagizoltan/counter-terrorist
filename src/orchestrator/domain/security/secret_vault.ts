import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

/**
 * SecretVault: Encrypted In-Memory Security Container.
 */
export class SecretVault {
    private vault: Map<string, { ciphertext: Uint8Array, iv: Uint8Array, salt: Uint8Array }> = new Map();
    private masterKey: CryptoKey | null = null;

    constructor(private logging: LoggingPort) {}

    async init(seed?: string) {
        const keyMaterial = seed ? new TextEncoder().encode(seed) : crypto.getRandomValues(new Uint8Array(32));
        this.masterKey = await crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:security:vault",
            message: "Secret Vault initialized."
        });
    }

    async setSecret(key: string, value: string) {
        if (!this.masterKey) return;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(value);
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.masterKey, encoded);
        this.vault.set(key, { ciphertext: new Uint8Array(ciphertext), iv, salt: new Uint8Array() });
    }

    async getSecret(key: string): Promise<string | null> {
        if (!this.masterKey) return null;
        const entry = this.vault.get(key);
        if (!entry) return null;
        try {
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: entry.iv }, this.masterKey, entry.ciphertext);
            return new TextDecoder().decode(decrypted);
        } catch { return null; }
    }

    purge() {
        this.vault.clear();
        this.masterKey = null;
    }
}
