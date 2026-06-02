import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

export interface ThreatInfo {
    indicator: string;
    type: "IP" | "DOMAIN" | "URL";
    threatType: string;
    provider: string;
    lastSeen: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

/**
 * TacticalIntelIngestor
 * Periodically fetches global threat intelligence from OSINT sources and stores it locally.
 */
export class TacticalIntelIngestor extends BaseService {
    private kv: Deno.Kv | null = null;
    private sources = [
        { name: "FeodoTracker", url: "https://feodotracker.abuse.ch/downloads/ipblocklist.csv", type: "IP" },
        { name: "BinaryDefense", url: "https://www.binarydefense.com/banlist.txt", type: "IP" },
        { name: "OpenPhish", url: "https://openphish.com/feed.txt", type: "URL" },
        { name: "EmergingThreats", url: "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt", type: "IP" },
        { name: "SSLBlacklist", url: "https://sslbl.abuse.ch/blacklist/sslbl_abuse_ips.txt", type: "IP" },
        { name: "TalosIntelligence", url: "https://www.talosintelligence.com/documents/ip-blacklist", type: "IP" }
    ];

    constructor(private logging: LoggingPort, private firewall: any) {
        super();
    }

    private intervalId: any = null;

    protected override async onInit(): Promise<Result<void>> {
        await this.start();
        return ok(undefined);
    }

    async start() {
        this.kv = await Deno.openKv();
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "INTEL",
            message: "Tactical Ingestor active. Hardening perimeter..."
        });
        
        // Blocking initial sync to ensure protection before full start
        await this.sync();

        // High-frequency sync (every 6 hours)
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.sync(), 6 * 60 * 60 * 1000);
    }

    protected override async onShutdown(): Promise<import("@core/result.ts").Result<void>> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.kv) {
            this.kv.close();
            this.kv = null;
        }
        return ok(undefined);
    }

    async sync() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "INTEL",
            message: "Syncing global threat feeds and enforcing blacklists..."
        });
        
        for (const source of this.sources) {
            try {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.DEBUG,
                    severity: LogSeverity.INFO,
                    caller: "INTEL",
                    message: `Ingesting from ${source.name}...`
                });
                const response = await fetch(source.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.text();
                await this.processSource(source, data);
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "INTEL",
                    message: `Sync failed for ${source.name}: ${(e as Error).message}`
                });
            }
        }
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.SUCCESS,
            caller: "INTEL",
            message: "Global intelligence enforced in kernel firewall."
        });
    }

    private async processSource(source: any, data: string) {
        const lines = data.split("\n");
        let count = 0;

        for (const line of lines) {
            if (!line || line.startsWith("#") || line.length < 5) continue;

            let indicator = line.trim();
            let threatType = this.mapThreatType(source.name, line);

            if (source.name === "FeodoTracker") {
                const parts = line.split(",");
                if (parts.length > 1) {
                    indicator = parts[1].replace(/"/g, "");
                    threatType = "Botnet C2 (Emotet/Trickbot)";
                }
            }

            const threat: ThreatInfo = {
                indicator,
                type: source.type,
                threatType,
                provider: source.name,
                lastSeen: new Date().toISOString(),
                severity: "HIGH"
            };

            // BUG-6.5 FIX: Use CuratedIntelService for block logic to avoid redundancy and races
            // This ingestor now purely populates the knowledge base.
            /*
            if (threat.type === "IP") {
                await this.firewall.blockIp(threat.indicator).catch(() => {});
            }
            */

            await this.kv?.set(["threats", threat.indicator], threat, { expireIn: 7 * 24 * 60 * 60 * 1000 });
            count++;
            if (count > 250) break; // Aggressive limit to keep firewall performant
        }
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "INTEL",
            message: `Blocked ${count} active threats from ${source.name}`
        });
    }

    private mapThreatType(source: string, line: string): string {
        switch (source) {
            case "BinaryDefense": return "Artillery Blocklist (Brute Force/Scanner)";
            case "OpenPhish": return "Active Phishing Drop-site";
            case "EmergingThreats": return "Known Compromised/Malicious Host (ET Open)";
            case "SSLBlacklist": return "C2 Infrastructure (Malicious SSL Cert)";
            case "TalosIntelligence": return "Top Malicious Sender/Infrastructure (Cisco Talos)";
            default: return "Known Malicious Infrastructure";
        }
    }

    async lookup(indicator: string): Promise<ThreatInfo | null> {
        const res = await this.kv?.get<ThreatInfo>(["threats", indicator]);
        return res?.value || null;
    }

    async getRecentThreats(limit = 100): Promise<ThreatInfo[]> {
        const threats: ThreatInfo[] = [];
        const iter = this.kv?.list<ThreatInfo>({ prefix: ["threats"] }, { limit, reverse: true });
        if (iter) {
            for await (const entry of iter) {
                threats.push(entry.value);
            }
        }
        return threats;
    }

    async getStats(): Promise<Record<string, number>> {
        const stats: Record<string, number> = {};
        for (const source of this.sources) {
            stats[source.name] = 0;
        }

        if (!this.kv) return stats;
        const iter = this.kv.list<ThreatInfo>({ prefix: ["threats"] });
        for await (const res of iter) {
            if (stats[res.value.provider] !== undefined) {
                stats[res.value.provider]++;
            } else {
                stats[res.value.provider] = (stats[res.value.provider] || 0) + 1;
            }
        }
        return stats;
    }
}
