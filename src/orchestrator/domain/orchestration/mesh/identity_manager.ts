import { LoggingPort, LogSeverity, LogType, ConfigurationPort, MeshAuthPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";

export class MeshIdentityManager {
    private nodeCert: { cert: string, key: string } | null = null;
    private httpClient: Deno.HttpClient | null = null;

    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort,
        private meshAuth: MeshAuthPort
    ) {}

    async initialize(nodeId: string): Promise<Result<{ httpClient: Deno.HttpClient, nodeCert: { cert: string, key: string } }>> {
        try {
            const tpmMode = this.config.getBoolean("TPM_RESIDENT_IDENTITY", true);
            let nodeCert;

            if (tpmMode) {
                const res = await this.meshAuth.generateProxyNodeCert(nodeId);
                if (!res.success) throw new Error(`MeshAuth generateProxyNodeCert failed: ${String(res.error)}`);
                nodeCert = { cert: res.data.cert, key: "HW_PROXY" };
            } else {
                const res = await this.meshAuth.generateNodeCert(nodeId);
                if (!res.success) throw new Error(`MeshAuth generateNodeCert failed: ${String(res.error)}`);
                nodeCert = res.data;
            }

            this.nodeCert = nodeCert;
            this.httpClient = Deno.createHttpClient({
                cert: this.nodeCert.cert,
                key: this.nodeCert.key,
                caCerts: await this.meshAuth.getTrustedCerts(),
                http2: true,
            });

            return ok({ httpClient: this.httpClient, nodeCert: this.nodeCert });
        } catch (e) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }

    getHttpClient() { return this.httpClient; }
    getNodeCert() { return this.nodeCert; }

    async rotateIdentity(nodeId: string): Promise<Result<{ httpClient: Deno.HttpClient, nodeCert: { cert: string, key: string } }>> {
        const oldClient = this.httpClient;
        const oldCert = this.nodeCert;

        try {
            const res = await this.initialize(nodeId);
            if (!res.success) throw res.error;
            if (oldClient) oldClient.close();
            return res;
        } catch (e) {
            this.httpClient = oldClient;
            this.nodeCert = oldCert;
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }
}
