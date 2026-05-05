import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

/**
 * RealDiscovery
 * Senior-Grade Security Implementation: Multi-Vector Layer 2/3 Asset Discovery.
 * 
 * Strategy:
 * 1. Context Acquisition (Gateway/Subnet/Interface)
 * 2. IPv6 Link-Local Multicast (Wakes up modern mobile/security-conscious devices)
 * 3. Targeted IPv4 ICMP Sweep (Segmented parallel batches)
 * 4. Neighbor Table Extraction & De-duplication
 */
export class RealDiscovery {
    private gatewayIp: string = "";
    private localSubnet: string = "";
    private interfaceName: string = "";

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
            // High-fidelity vector: IPv6 Multicast (ff02::1)
            // This bypasses many ICMPv4 filters and forces modern devices to respond.
            await this.performIPv6Multicast(this.interfaceName);
        }

        if (this.localSubnet) {
            // Standard vector: Segmented IPv4 Sweep
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
            const routeCmd = new Deno.Command("ip", { args: ["route", "show", "default"] });
            const { stdout } = await routeCmd.output();
            const output = new TextDecoder().decode(stdout);
            const match = output.match(/via\s+([\d\.]+)\s+dev\s+(\S+)/);
            if (match) {
                this.gatewayIp = match[1];
                this.interfaceName = match[2];

                const devRouteCmd = new Deno.Command("ip", { args: ["route", "show", "dev", this.interfaceName] });
                const { stdout: devOut } = await devRouteCmd.output();
                const devStr = new TextDecoder().decode(devOut);
                const sMatch = devStr.match(/(\d+\.\d+\.\d+\.0\/\d+)/);
                if (sMatch) this.localSubnet = sMatch[1];
            }
        } catch {}
    }

    private async performIPv6Multicast(iface: string) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.DEBUG,
            caller: "SECURITY-DISCOVERY",
            message: `Dispatching IPv6 Link-Local Multicast on ${iface}...`
        });
        try {
            // Pinging the all-nodes multicast address
            const cmd = new Deno.Command("ping", {
                args: ["-c", "2", "-W", "1", `ff02::1%${iface}`],
                stdout: "null",
                stderr: "null"
            });
            await cmd.output();
        } catch {}
    }

    private async performIPv4Sweep(subnet: string) {
        const prefix = subnet.split(".0/")[0];
        if (!prefix) return;

        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.DEBUG,
            caller: "SECURITY-DISCOVERY",
            message: `Performing segmented IPv4 sweep on ${prefix}.0/24...`
        });
        
        // Parallelizing in batches of 32 to avoid system resource starvation
        const batchSize = 32;
        for (let i = 1; i <= 254; i += batchSize) {
            const promises: Promise<any>[] = [];
            for (let j = i; j < i + batchSize && j <= 254; j++) {
                promises.push(this.silentPing(`${prefix}.${j}`));
            }
            await Promise.allSettled(promises);
        }
    }

    private async silentPing(ip: string) {
        try {
            const cmd = new Deno.Command("ping", {
                args: ["-c", "1", "-W", "1", ip],
                stdout: "null",
                stderr: "null"
            });
            await cmd.output();
        } catch {}
    }

    private async scanEthernet() {
        try {
            // Capturing both IPv4 and IPv6 neighbors
            const v4 = await this.captureNeighbors("ip", ["neighbor", "show"]);
            const v6 = await this.captureNeighbors("ip", ["-6", "neighbor", "show"]);
            
            // Merge and de-duplicate by MAC
            const merged = new Map();
            [...v4, ...v6].forEach(d => {
                if (!merged.has(d.mac)) {
                    merged.set(d.mac, d);
                } else {
                    // Prefer IPv4 for display if available
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

    private async captureNeighbors(bin: string, args: string[]) {
        const command = new Deno.Command(bin, { args, stdout: "piped" });
        const { stdout } = await command.output();
        const output = new TextDecoder().decode(stdout);
        const devices: any[] = [];
        
        for (const line of output.split("\n")) {
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
            "f25af4": "MOBILE_DEVICE", // Likely Android/iOS Randomized
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
            const command = new Deno.Command("nmcli", {
                args: ["-t", "-f", "SSID,BSSID,SIGNAL,SECURITY", "dev", "wifi", "list"],
                stdout: "piped",
                stderr: "piped",
            });
            const { stdout } = await command.output();
            const output = new TextDecoder().decode(stdout);
            const aps: any[] = [];
            for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                const rawParts = line.replace(/\\:/g, "__COLON__").split(":");
                if (rawParts.length >= 4) {
                    aps.push({
                        ssid: rawParts[0].replace(/__COLON__/g, ":") || "--",
                        mac: rawParts[1].replace(/__COLON__/g, ":").toLowerCase(),
                        signal: parseInt(rawParts[2]),
                        encryption: rawParts[3].replace(/__COLON__/g, ":") || "OPEN",
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
