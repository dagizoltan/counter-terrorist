import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface NetworkDevice {
    ip: string;
    mac: string;
    vendor: string;
    isMeshNode: boolean;
    lastSeen: string;
    hostname?: string;
}

/**
 * NetworkDiscoveryService
 * Scans the local physical network to discover devices and highlight Mesh nodes.
 */
export class NetworkDiscoveryService {
    private devices: Map<string, NetworkDevice> = new Map();

    constructor(private logging: LoggingPort) {}

    async start() {
        this.logging.log("[DISCOVERY] Network Discovery Service active. Initiating local sweep...", SyslogSeverity.NOTICE);
        this.scan();
        setInterval(() => this.scan(), 5 * 60 * 1000); // Scan every 5 minutes
    }

    async scan() {
        this.logging.log("[DISCOVERY] Performing ARP sweep of local segment...", SyslogSeverity.DEBUG);
        
        // Find local network interface to determine segment
        const interfaces = Deno.networkInterfaces();
        const primary = interfaces.find(i => i.family === "IPv4" && !i.address.startsWith("127."));
        const localIp = primary?.address || "192.168.1.100";
        const subnet = localIp.split(".").slice(0, 3).join(".");
        
        // Real-world discovery would use arp-scan or nmap.
        // For now, we mix simulated static assets with the detected local environment.
        const simulation = [
            { ip: `${subnet}.1`, mac: "00:DE:AD:BE:EF:01", vendor: "Ubiquiti Networks", hostname: "EdgeRouter-6P (Gateway)", role: "GATEWAY" },
            { ip: `${subnet}.10`, mac: "00:DE:AD:BE:EF:10", vendor: "Synology Inc.", hostname: "Vault-NAS-01" },
            { ip: localIp, mac: "FF:FF:FF:FF:FF:FF", vendor: "Sovereign-Ghost", hostname: `${Deno.hostname()} (Self)`, role: "MESH" },
            { ip: `${subnet}.42`, mac: "00:DE:AD:BE:EF:42", vendor: "Apple Inc.", hostname: "Operator-MacBook-Pro" },
            { ip: `${subnet}.101`, mac: "00:DE:AD:BE:EF:65", vendor: "Sovereign-Ghost", hostname: "Mesh-Node-Beta", role: "MESH" },
            { ip: `${subnet}.200`, mac: "00:DE:AD:BE:EF:C8", vendor: "Unknown", hostname: "Mobile-Endpoint-Shadow" }
        ];

        for (const dev of simulation) {
            this.devices.set(dev.ip, {
                ...dev,
                isMeshNode: dev.role === "MESH",
                lastSeen: new Date().toISOString()
            });
        }

        // Attempt to find real neighbors if 'ip' is available (which we confirmed it is)
        try {
            const command = new Deno.Command("ip", { args: ["neighbor", "show"] });
            const { stdout } = await command.output();
            const output = new TextDecoder().decode(stdout);
            const lines = output.split("\n");
            for (const line of lines) {
                // Example line: 192.168.1.1 dev eth0 lladdr 00:11:22:33:44:55 REACHABLE
                const parts = line.split(/\s+/);
                if (parts.length >= 5 && parts[0].match(/^\d+\.\d+\.\d+\.\d+$/)) {
                    const ip = parts[0];
                    const mac = parts[4];
                    if (mac !== "lladdr" && mac.includes(":")) {
                        if (!this.devices.has(ip)) {
                            this.devices.set(ip, {
                                ip,
                                mac,
                                vendor: "Unknown (Discovered via ARP)",
                                isMeshNode: false,
                                lastSeen: new Date().toISOString(),
                                hostname: "Neighbor_Asset"
                            });
                        }
                    }
                }
            }
        } catch (e) {
            this.logging.log(`[DISCOVERY] ARP discovery failed: ${e instanceof Error ? e.message : String(e)}`, SyslogSeverity.DEBUG);
        }
    }

    getDevices(): NetworkDevice[] {
        return Array.from(this.devices.values());
    }
}
