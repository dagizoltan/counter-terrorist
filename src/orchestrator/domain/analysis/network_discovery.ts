import { loggingService, LoggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";

export interface NetworkDevice {
    id: string;
    ip?: string;
    mac: string;
    ssid?: string;
    vendor?: string;
    isMeshNode: boolean;
    isLocal: boolean;
    lastSeen: string;
    hostname?: string;
    state?: string;
    type: "WIFI" | "BLUETOOTH" | "ETHERNET" | "MESH";
    signal?: number;
    encryption?: string;
}

/**
 * NetworkDiscoveryService
 * Aggregates multi-vector signal intelligence from the local environment.
 * Authoritative: Uses RealDiscovery for kernel-level telemetry.
 */
export class NetworkDiscoveryService {
    private devices: Map<string, NetworkDevice> = new Map();
    private discovery: any;
    private selfId: string = "LOCAL_NODE";

    constructor(private logging: LoggingService) {
        this.selfId = "LOCAL_NODE";
    }

    async start() {
        this.logging.log("[DISCOVERY] environmental sensors active. Initiating real-time sweep...", SyslogSeverity.NOTICE);
        await this.scan();
        // Frequent sweeps for security visibility (every 20s)
        setInterval(() => this.scan(), 20000); 
    }

    async scan() {
        const currentBatch = new Set<string>();

        // 1. Mesh Awareness (Self Identification)
        const primary = await this.getPrimaryInterface();
        if (primary) {
            const selfId = primary.mac?.toLowerCase() || "LOCAL_NODE";
            this.selfId = selfId;
            this.devices.set(selfId, {
                id: selfId,
                ip: primary.address,
                mac: selfId,
                vendor: "Sovereign-Ghost",
                isMeshNode: true,
                isLocal: true,
                lastSeen: new Date().toISOString(),
                hostname: `${Deno.hostname()} (LOCAL)`,
                state: "REACHABLE",
                type: "MESH"
            });
            currentBatch.add(selfId);
        }

        // 2. Real-time Infrastructure Discovery
        if (!this.discovery) {
            try {
               const { RealDiscovery } = await import("./real_discovery.ts");
               this.discovery = new RealDiscovery();
            } catch (e) {
               this.logging.log(`[DISCOVERY] Failed to load RealDiscovery: ${(e as Error).message}. Falling back to simulation.`, SyslogSeverity.WARNING);
               const { MockDiscovery } = await import("./mock_discovery.ts");
               this.discovery = new MockDiscovery();
            }
        }

        if (this.discovery) {
            try {
                const results = await this.discovery.scan();
                
                // Ethernet / ARP / Local Assets
                if (results.ethernet) {
                    results.ethernet.forEach((device: any) => {
                        const mac = device.mac.toLowerCase();
                        const existing = this.devices.get(mac);
                        
                        // Local identification
                        const isSelf = mac === this.selfId;
                        const type = isSelf || (existing?.type === "MESH") ? "MESH" : "ETHERNET";
                        
                        this.devices.set(mac, {
                            ...device,
                            mac,
                            vendor: isSelf ? "Sovereign-Ghost" : (existing?.vendor || "Local_Asset"),
                            isMeshNode: isSelf || (existing?.isMeshNode || false),
                            isLocal: isSelf,
                            lastSeen: new Date().toISOString(),
                            hostname: device.hostname || (isSelf ? `${Deno.hostname()} (LOCAL)` : "PEER_NODE"),
                            type
                        });
                        currentBatch.add(mac);
                    });
                }

                // WiFi Environmental Signals
                if (results.wifi) {
                    results.wifi.forEach((ap: any) => {
                        const id = `WIFI_${ap.mac.toLowerCase()}`;
                        this.devices.set(id, {
                            ...ap,
                            id,
                            mac: ap.mac.toLowerCase(),
                            vendor: "Wireless_AP",
                            isMeshNode: false,
                            isLocal: false,
                            lastSeen: new Date().toISOString(),
                            state: ap.encryption?.includes("WPA") ? "ENCRYPTED" : (ap.encryption?.includes("OPEN") ? "OPEN" : "SECURE"),
                            type: "WIFI"
                        });
                        currentBatch.add(id);
                    });
                }

                // Bluetooth Environmental Signals
                if (results.bluetooth) {
                    results.bluetooth.forEach((dev: any) => {
                        const id = `BT_${dev.mac.toLowerCase()}`;
                        this.devices.set(id, {
                            ...dev,
                            id,
                            mac: dev.mac.toLowerCase(),
                            vendor: "Bluetooth_Device",
                            isMeshNode: false,
                            isLocal: false,
                            lastSeen: new Date().toISOString(),
                            state: "ACTIVE",
                            type: "BLUETOOTH"
                        });
                        currentBatch.add(id);
                    });
                }

            } catch (e) {
                this.logging.log(`[DISCOVERY] Real-time sweep failed: ${(e as Error).message}`, SyslogSeverity.ERROR);
            }
        }

        // Purge dead assets (> 10 mins unseen for real-time accuracy)
        for (const [id, device] of this.devices.entries()) {
            if (!currentBatch.has(id)) {
                const lastSeenTime = new Date(device.lastSeen).getTime();
                if (Date.now() - lastSeenTime > 600000) {
                    this.devices.delete(id);
                } else {
                    if (device.type !== "WIFI" && device.type !== "BLUETOOTH") {
                        device.state = "STALE";
                    }
                }
            }
        }
    }

    getDevices(): NetworkDevice[] {
        return Array.from(this.devices.values());
    }

    private async getPrimaryInterface() {
        try {
            const interfaces = Deno.networkInterfaces();
            const primary = interfaces.find(i => i.family === "IPv4" && !i.address.startsWith("127."));
            return primary;
        } catch {
            return null;
        }
    }
}
