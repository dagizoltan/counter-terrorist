import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

/**
 * RealDiscovery
 * Senior-Grade Security Implementation: Multi-Vector Layer 2/3 Asset Discovery.
 */
export class RealDiscovery {
    private gatewayIp: string = "";
    private localSubnet: string = "";
    private interfaceName: string = "";

    constructor(private executor: SystemExecutor) {}

    async scan() {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "SECURITY-DISCOVERY",
            message: "Initiating authoritative audit..."
        });
        await this.identifyNetworkContext();

        if (this.interfaceName) {
            await this.performIPv6Multicast(this.interfaceName);
        }

        if (this.localSubnet) {
            await this.performIPv4Sweep(this.localSubnet);
        }

        const results = {
            ethernet: await this.scanEthernet(),
            wifi: await this.scanWifi(),
            bluetooth: []
        };
        
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "SECURITY-DISCOVERY",
            message: `Audit complete. Assets identified: ${results.ethernet.length}`
        });
        return results;
    }

    private async identifyNetworkContext() {
        try {
            const { success, stdout } = await this.executor.execute("ip", ["route", "show", "default"]);
            if (!success) return;
            
            const match = stdout.match(/via\s+([\d\.]+)\s+dev\s+(\S+)/);
            if (match) {
                this.gatewayIp = match[1];
                this.interfaceName = match[2];

                const devRoute = await this.executor.execute("ip", ["route", "show", "dev", this.interfaceName]);
                if (devRoute.success) {
                    const sMatch = devRoute.stdout.match(/(\d+\.\d+\.\d+\.0\/\d+)/);
                    if (sMatch) this.localSubnet = sMatch[1];
                }
            }
        } catch {}
    }

    private async performIPv6Multicast(iface: string) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "SECURITY-DISCOVERY",
            message: `Dispatching IPv6 Link-Local Multicast on ${iface}...`
        });
        try {
            await this.executor.execute("ping", ["-c", "2", "-W", "1", `ff02::1%${iface}`]);
        } catch {}
    }

    private async performIPv4Sweep(subnet: string) {
        const prefix = subnet.split(".0/")[0];
        if (!prefix) return;

        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "SECURITY-DISCOVERY",
            message: `Performing segmented IPv4 sweep on ${prefix}.0/24...`
        });
        
        const batchSize = 32;
        for (let i = 1; i <= 254; i += batchSize) {
            const promises: Promise<unknown>[] = [];
            for (let j = i; j < i + batchSize && j <= 254; j++) {
                promises.push(this.silentPing(`${prefix}.${j}`));
            }
            await Promise.allSettled(promises);
        }
    }

    private async silentPing(ip: string) {
        try {
            await this.executor.execute("ping", ["-c", "1", "-W", "1", ip]);
        } catch {}
    }

    private async scanEthernet() {
        try {
            const v4 = await this.captureNeighbors(["neighbor", "show"]);
            const v6 = await this.captureNeighbors(["-6", "neighbor", "show"]);
            
            const merged = new Map();
            [...v4, ...v6].forEach(d => {
                if (!merged.has(d.mac)) {
                    merged.set(d.mac, d);
                } else {
                    const existing = merged.get(d.mac);
                    if (d.ip.includes(".") && existing.ip.includes(":")) {
                        merged.set(d.mac, d);
                    }
                }
            });

            return Array.from(merged.values());
        } catch {
            return [];
        }
    }

    private async captureNeighbors(args: string[]) {
        const { success, stdout } = await this.executor.execute("ip", args);
        if (!success) return [];
        
        const devices: Record<string, string>[] = [];
        for (const line of stdout.split("\n")) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4 && parts.includes("lladdr")) {
                const ip = parts[0];
                const mac = parts[parts.indexOf("lladdr") + 1];
                const state = parts[parts.length - 1];
                
                if (state !== "FAILED" && mac && mac.includes(":") && mac !== "00:00:00:00:00:00") {
                    devices.push({
                        ip,
                        mac: mac.toLowerCase(),
                        hostname: ip === this.gatewayIp ? "ROUTER_GATEWAY" : this.identifyVendor(mac),
                        state: state.toLowerCase(),
                        type: "ETHERNET"
                    });
                }
            }
        }
        return devices;
    }

    private identifyVendor(mac: string) {
        const prefix = mac.toLowerCase().replace(/:/g, "").slice(0, 6);
        const map: Record<string, string> = {
            "841572": "TP-LINK_TECH",
            "f25af4": "MOBILE_DEVICE",
            "8adef7": "MOBILE_DEVICE",
            "021e8f": "LOCAL_NODE_VIRTUAL",
            "b827eb": "RASPBERRY_PI",
            "d850e6": "D-LINK",
            "bccfcc": "NETGEAR"
        };
        return map[prefix] || "NETWORK_ASSET";
    }

    private async scanWifi() {
        try {
            const { success, stdout } = await this.executor.execute("nmcli", ["-t", "-f", "SSID,BSSID,SIGNAL,SECURITY", "dev", "wifi", "list"]);
            if (!success) return [];
            
            const aps: Record<string, string | number>[] = [];
            for (const line of stdout.split("\n")) {
                if (!line.trim()) continue;
                
                // nmcli terse output escapes colons as \:
                // We split by colons that are NOT preceded by a backslash
                const parts = line.split(/(?<!\\):/).map(p => p.replace(/\\:/g, ":"));
                
                if (parts.length >= 4) {
                    aps.push({
                        ssid: parts[0] || "--",
                        mac: parts[1].toLowerCase(),
                        signal: parseInt(parts[2]) || 0,
                        encryption: parts[3] || "OPEN",
                        type: "WIFI"
                    });
                }
            }
            return aps;
        } catch {
            return [];
        }
    }
}
