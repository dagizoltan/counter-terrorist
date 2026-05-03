import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface NetworkDevice {
    id: string; // Unique ID (MAC or SSID)
    ip?: string;
    mac: string;
    vendor: string;
    isMeshNode: boolean;
    lastSeen: string;
    hostname?: string;
    state: string; // REACHABLE, STALE, FAILED, OPEN, etc.
    isLocal: boolean;
    type: "ETHERNET" | "WIFI" | "BLUETOOTH" | "MESH";
    signal?: number; // For WIFI/BT
    encryption?: string; // For WIFI
    ssid?: string; // For WIFI
}

/**
 * NetworkDiscoveryService
 * Enhanced environmental scanning for local assets, open Wi-Fi networks, and nearby devices.
 */
export class NetworkDiscoveryService {
    private devices: Map<string, NetworkDevice> = new Map();

    constructor(private logging: LoggingPort) {}

    async start() {
        this.logging.log("[DISCOVERY] environmental sensors active. Initiating multi-vector sweep...", SyslogSeverity.NOTICE);
        await this.scan();
        setInterval(() => this.scan(), 30000); 
    }

    async scan() {
        const currentBatch = new Set<string>();
        
        await this.scanLocalSubnet(currentBatch);
        await this.scanWifi(currentBatch);
        await this.scanBluetooth(currentBatch);

        // Purge truly dead assets (> 15 mins unseen)
        for (const [id, device] of this.devices.entries()) {
            if (!currentBatch.has(id)) {
                const lastSeenTime = new Date(device.lastSeen).getTime();
                if (Date.now() - lastSeenTime > 900000) {
                    this.devices.delete(id);
                } else {
                    if (device.type !== "WIFI" && device.type !== "BLUETOOTH") {
                        device.state = "STALE";
                    }
                }
            }
        }
    }

    private async scanLocalSubnet(currentBatch: Set<string>) {
        const interfaces = Deno.networkInterfaces();
        const primary = interfaces.find(i => i.family === "IPv4" && !i.address.startsWith("127."));
        const localIp = primary?.address || "127.0.0.1";

        // Mark Self
        const selfId = primary?.mac || "LOCAL_NODE";
        this.devices.set(selfId, {
            id: selfId,
            ip: localIp,
            mac: primary?.mac || "00:00:00:00:00:00",
            vendor: "Sovereign-Ghost",
            hostname: `${Deno.hostname()} (LOCAL)`,
            isMeshNode: true,
            isLocal: true,
            lastSeen: new Date().toISOString(),
            state: "REACHABLE",
            type: "MESH"
        });
        currentBatch.add(selfId);

        try {
            const command = new Deno.Command("ip", { args: ["neighbor", "show"] });
            const { stdout } = await command.output();
            const output = new TextDecoder().decode(stdout);
            const lines = output.split("\n");
            
            for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 5 && parts[0].match(/^\d+\.\d+\.\d+\.\d+$/)) {
                    const ip = parts[0];
                    const mac = parts[4];
                    const state = parts[parts.length - 1];

                    if (state === "FAILED" || mac === "lladdr") continue;

                    if (mac.includes(":")) {
                        currentBatch.add(mac);
                        const existing = this.devices.get(mac);
                        this.devices.set(mac, {
                            id: mac,
                            ip,
                            mac,
                            vendor: existing?.vendor || "Local_Asset",
                            isMeshNode: existing?.isMeshNode || false,
                            isLocal: false,
                            lastSeen: new Date().toISOString(),
                            hostname: existing?.hostname || (ip.endsWith(".1") ? "GATEWAY" : "PEER_NODE"),
                            state,
                            type: "ETHERNET"
                        });
                    }
                }
            }
        } catch (e) {
            this.logging.log(`[DISCOVERY:ARP] Failed: ${e instanceof Error ? e.message : String(e)}`, SyslogSeverity.DEBUG);
        }
    }

    private async scanWifi(currentBatch: Set<string>) {
        try {
            // Using nmcli for standardized output
            const command = new Deno.Command("nmcli", { 
                args: ["-t", "-f", "SSID,BSSID,SIGNAL,SECURITY", "dev", "wifi", "list"] 
            });
            const { stdout } = await command.output();
            const output = new TextDecoder().decode(stdout);
            const lines = output.split("\n").filter(l => l.trim());

            for (const line of lines) {
                // nmcli escapes colons with backslashes. We need to split by colons NOT preceded by backslash.
                // However, Deno's split doesn't support negative lookbehind in older versions sometimes.
                // Let's use a simpler approach: replace \: with a unique placeholder, split, then restore.
                const normalized = line.replace(/\\:/g, "__COLON__");
                const parts = normalized.split(":");
                if (parts.length < 4) continue;

                const ssid = parts[0].replace(/__COLON__/g, ":");
                const bssid = parts[1].replace(/__COLON__/g, ":");
                const signal = parts[2];
                const security = parts[3].replace(/__COLON__/g, ":");

                const id = `WIFI_${bssid}`;
                currentBatch.add(id);

                this.devices.set(id, {
                    id,
                    mac: bssid,
                    ssid: ssid || "[HIDDEN]",
                    vendor: "Wireless_AP",
                    isMeshNode: false,
                    isLocal: false,
                    lastSeen: new Date().toISOString(),
                    state: (security === "" || security === "--") ? "OPEN" : "ENCRYPTED",
                    type: "WIFI",
                    signal: parseInt(signal) || 0,
                    encryption: security || "NONE"
                });
            }
        } catch (e) {
            this.logging.log(`[DISCOVERY:WIFI] Sensor unavailable or failed`, SyslogSeverity.DEBUG);
        }
    }

    private async scanBluetooth(currentBatch: Set<string>) {
        try {
            const command = new Deno.Command("hcitool", { args: ["scan"] });
            const { stdout } = await command.output();
            const output = new TextDecoder().decode(stdout);
            const lines = output.split("\n").slice(1); 

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const mac = parts[0];
                    const name = parts.slice(1).join(" ");
                    const id = `BT_${mac}`;
                    currentBatch.add(id);

                    this.devices.set(id, {
                        id,
                        mac,
                        vendor: "Bluetooth_Device",
                        hostname: name || "UNKNOWN_BT",
                        isMeshNode: false,
                        isLocal: false,
                        lastSeen: new Date().toISOString(),
                        state: "DETECTED",
                        type: "BLUETOOTH"
                    });
                }
            }
        } catch (e) {
        }
    }

    getDevices(): NetworkDevice[] {
        return Array.from(this.devices.values());
    }
}
