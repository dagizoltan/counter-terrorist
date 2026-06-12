import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { MeshNode } from "../mesh.ts";

export interface ProbeDeps {
    signPayload(payload: unknown): Promise<string>;
    validateAndRegisterNode(node: MeshNode): Promise<void>;
}

export class MeshProbeManager {
    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort,
        private deps: ProbeDeps,
        private httpClient: Deno.HttpClient | null,
        private port: number
    ) {}

    setHttpClient(client: Deno.HttpClient | null) {
        this.httpClient = client;
    }

    async probeNode(address: string, meshSecret: string | undefined, selfId: string) {
        if (!this.httpClient) return;

        const { isValidIP } = await import("../../../infrastructure/system/validation.ts");
        const isLoopback = address === "127.0.0.1" || address === "::1" || address.startsWith("127.");
        const isMetadata = address === "169.254.169.254" || address.startsWith("169.254.");

        if (!isValidIP(address) || isLoopback || isMetadata) return;

        const allowedSubnets = this.config.getEnv("MESH_ALLOWED_SUBNETS");
        if (allowedSubnets && !this.isIpAllowed(address, allowedSubnets)) return;

        try {
            const timestamp = Date.now();
            let signature = "unsigned";

            if (meshSecret) {
                const { signPayload } = await import("../../../core/crypto_utils.ts");
                signature = await signPayload({ target: address, ts: timestamp }, meshSecret);
            }

            const url = `https://${address}:${this.port}/api/mesh/ping?ts=${timestamp}&sig=${signature}`;
            const res = await fetch(url, {
                client: this.httpClient,
                signal: AbortSignal.timeout(2000)
            });

            if (res.ok) {
                const body = await res.json();
                if (body.success && body.nodeId) {
                    await this.deps.validateAndRegisterNode({
                        id: body.nodeId,
                        hostname: body.nodeId,
                        address,
                        port: this.port,
                        lastSeen: Date.now(),
                        verified: true,
                    });
                }
            }
        } catch { /* silent */ }
    }

    private isIpAllowed(ip: string, allowedRanges: string): boolean {
        const ranges = allowedRanges.split(",").map(r => r.trim());
        for (const range of ranges) {
            if (range.includes("/")) {
                if (this.ipInCidr(ip, range)) return true;
            } else if (ip === range) return true;
        }
        return false;
    }

    private ipInCidr(ip: string, cidr: string): boolean {
        try {
            const [range, bitsStr] = cidr.split("/");
            const bits = parseInt(bitsStr, 10);
            const ipNum = this.ipToLong(ip);
            const rangeNum = this.ipToLong(range);
            const mask = -1 << (32 - bits);
            return (ipNum & mask) === (rangeNum & mask);
        } catch { return false; }
    }

    private ipToLong(ip: string): number {
        const parts = ip.split(".").map(Number);
        return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    }
}
