import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { MeshNode } from "../mesh.ts";
import { secureRandomInt } from "../../../core/crypto_utils.ts";
import { MeshChaosEngine } from "../chaos_engine.ts";

export interface SyncDeps {
    signPayload(payload: unknown): Promise<string>;
    init(): Promise<void>;
}

export class MeshSyncManager {
    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort,
        private chaosEngine: MeshChaosEngine,
        private deps: SyncDeps,
        private httpClient: Deno.HttpClient | null
    ) {}

    setHttpClient(client: Deno.HttpClient | null) {
        this.httpClient = client;
    }

    async sendSync(node: MeshNode, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!this.httpClient) await this.deps.init();
        const client = this.httpClient!;

        const url = `https://${node.address}:${node.port}/api/mesh/sync`;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        };

        const paddingLength = secureRandomInt(0, 255);
        const padding = "x".repeat(paddingLength);

        const paddedPayload = { ...payload, _p: padding };

        const signature = await this.deps.signPayload(paddedPayload);
        if (signature !== "unsigned") {
            headers["X-Mesh-Signature"] = signature;
        }

        const jitToken = this.config.getEnv("PROVISIONING_TOKEN");
        if (jitToken) {
            headers["X-Provisioning-Token"] = jitToken;
        }

        const jitter = secureRandomInt(0, 800);
        await new Promise(r => setTimeout(r, jitter));

        const res = await this.chaosEngine.applyChaos(() => fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(paddedPayload),
            client,
            signal: AbortSignal.timeout(15000)
        }));

        if (!res.ok) {
            throw new Error(`Sync failed with status ${res.status}`);
        }

        try {
            return await res.json();
        } catch {
            return { success: true };
        }
    }
}
