import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { MeshNode, MeshNodeSchema } from "../mesh.ts";
import { secureRandomInt } from "../../../core/crypto_utils.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";

export interface DiscoveryDeps {
    probeNode(address: string): Promise<void>;
    scanNetwork(): Promise<void>;
    resolveSplitBrain(): Promise<void>;
    registerNode(node: MeshNode): Promise<void>;
}

export class MeshDiscoveryManager {
    private discoveryInterval: number | null = null;
    private mdnsListener: Deno.DatagramConn | null = null;
    private isDiscovering: boolean = false;

    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort,
        private deps: DiscoveryDeps
    ) {}

    start() {
        if (this.discoveryInterval) return;

        if (this.config.getEnv("SINGLE_NODE") === "true") {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "mesh:discovery",
                message: "SINGLE_NODE mode active. Mesh discovery bypassed."
            });
            return;
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "mesh:discovery",
            message: "Starting zero-config node discovery..."
        });

        this.discoveryInterval = setInterval(() => {
            this.discoverSubnet();
            this.deps.scanNetwork();
            this.deps.resolveSplitBrain();
        }, TACTICAL_CONSTANTS.MESH.DISCOVERY_INTERVAL_MS + secureRandomInt(0, 5000));
    }

    async discoverSubnet() {
        if (this.isDiscovering) return;
        this.isDiscovering = true;

        try {
            const interfaces = Deno.networkInterfaces();
            const localIps = interfaces
                .filter(i => i.family === "IPv4" && !i.address.startsWith("127."))
                .map(i => i.address);

            for (const ip of localIps) {
                const subnet = ip.split(".").slice(0, 3).join(".");
                const probes = [];
                const MAX_CONCURRENCY = 2;

                for (let i = 1; i < 255; i++) {
                    const targetIp = `${subnet}.${i}`;
                    if (targetIp === ip) continue;

                    probes.push(this.deps.probeNode(targetIp));
                    if (probes.length >= MAX_CONCURRENCY) {
                        await Promise.all(probes);
                        probes.length = 0;
                        await new Promise(r => setTimeout(r, 500 + secureRandomInt(0, 1500)));
                    }
                }
                await Promise.all(probes);
            }
        } finally {
            this.isDiscovering = false;
        }
    }

    stop() {
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }
        if (this.mdnsListener) {
            try { this.mdnsListener.close(); } catch { /* ignore */ }
            this.mdnsListener = null;
        }
    }
}
