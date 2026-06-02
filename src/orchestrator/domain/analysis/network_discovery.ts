import { BaseService } from "@core/base_service.ts";
import { LoggingPort as LoggingService, LogSeverity, LogType, ExecutorPort, MeshPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";

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
export class NetworkDiscoveryService extends BaseService {
    private devices: Map<string, NetworkDevice> = new Map();
    private discovery: any;
    private selfId: string = "LOCAL_NODE";
    private mesh?: MeshPort;
    private intervalId: any = null;
    private isScanning = false;

    constructor(private logging: LoggingService, private executor: ExecutorPort) {
        super();
        this.selfId = "LOCAL_NODE";
    }

    setMesh(mesh: MeshPort) {
        this.mesh = mesh;
    }

    protected override async onInit(): Promise<Result<void>> {
        const res = await this.start();
        return res;
    }

    async start(): Promise<Result<void>> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:analysis:network_discovery",
            message: "Environmental sensors active. Initiating real-time sweep..."
        });
        // Non-blocking initial sweep
        this.scan().catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:network_discovery",
                message: `Initial sweep failed: ${e.message}`
            });
        });
        // Frequent sweeps for security visibility (every 20s)
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.scan(), 20000);
        return ok(undefined);
    }

    async scan() {
        // BUG-6.6 FIX: Prevent overlapping scans
        if (this.isScanning) return;
        this.isScanning = true;

        try {
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
               this.discovery = new RealDiscovery(this.executor as any);
            } catch (e) {
               this.logging.log({
                   timestamp: new Date().toISOString(),
                   type: LogType.GENERIC,
                   severity: LogSeverity.WARNING,
                   caller: "orchestrator:domain:analysis:network_discovery",
                   message: `Failed to load RealDiscovery: ${(e as Error).message}. Falling back to simulation.`
               });
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

                // 3. Mesh Integration (Verified Peers)
                if (this.mesh) {
                    const nodes = (this.mesh as any).getNodes();
                    nodes.forEach((node: any) => {
                        const mac = (node.id || "").toLowerCase();
                        if (!mac) return;

                        const existing = this.devices.get(mac);
                        this.devices.set(mac, {
                            id: mac,
                            ip: node.address,
                            mac,
                            vendor: "Sovereign-Ghost",
                            isMeshNode: true,
                            isLocal: mac === this.selfId,
                            lastSeen: new Date(node.lastSeen).toISOString(),
                            hostname: node.hostname,
                            state: node.verified ? "VERIFIED" : "UNVERIFIED",
                            type: "MESH"
                        });
                        currentBatch.add(mac);
                    });
                }

            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:analysis:network_discovery",
                    message: `Real-time sweep failed: ${(e as Error).message}`
                });
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
        } finally {
            this.isScanning = false;
        }
    }

    getDevices(): NetworkDevice[] {
        return Array.from(this.devices.values());
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        return ok(undefined);
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
