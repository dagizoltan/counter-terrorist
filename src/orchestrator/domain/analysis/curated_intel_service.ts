import { ConfigurationPort, LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface IntelIndicator {
    indicator: string;
    type: "IP" | "URL" | "DOMAIN";
    provider: string;
    confidence: number; // 0-100
    threatType: string;
    firstSeen: string;
    lastSeen: string;
    score: number; // Calculated reputation score
    ttl: number; // Hours until decay
}

const SOURCE_WEIGHTS: Record<string, number> = {
    "Abuse.ch": 95,
    "Spamhaus": 98,
    "FireHOL_L1": 85,
    "FireHOL_L2": 60,
    "AlienVault": 50,
    "EmergingThreats": 80,
    "OpenPhish": 90,
    "BinaryDefense": 85,
    "TalosIntelligence": 90
};



export class CuratedIntelService {
    private kv?: Deno.Kv;
    private sources = [
        { name: "Abuse.ch", url: "https://feodotracker.abuse.ch/downloads/ipblocklist.csv", type: "IP" },
        { name: "BinaryDefense", url: "https://www.binarydefense.com/banlist.txt", type: "IP" },
        { name: "OpenPhish", url: "https://openphish.com/feed.txt", type: "URL" },
        { name: "EmergingThreats", url: "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt", type: "IP" },
        { name: "TalosIntelligence", url: "https://www.talosintelligence.com/documents/ip-blacklist", type: "IP" }
    ];

    private allowlist: string[] = [];
    private blacklist: Set<string> = new Set();

    constructor(private logging: LoggingPort, private firewall: any, private config: ConfigurationPort) {
        const list = config.getEnv("INTEL_ALLOWLIST") || "";
        this.allowlist = list.split(",").map(i => i.trim()).filter(Boolean);
    }

    getBlacklist(): Set<string> {
        return this.blacklist;
    }

    async start() {
        this.kv = await Deno.openKv();
        this.logging.log("[INTEL] Curated Intelligence Pipeline engaged. Scoring engine active.", SyslogSeverity.NOTICE);
        
        // Blocking initial sync for pre-start hardening
        await this.sync();

        // High-fidelity sync (Critical feeds every configurable interval)
        const intervalHours = this.config.getNumber("INTEL_SYNC_INTERVAL_HOURS", 1);
        setInterval(() => this.sync(), intervalHours * 60 * 60 * 1000); 
    }

    async sync() {
        this.logging.log("[INTEL] Commencing weighted intelligence ingestion...", SyslogSeverity.INFORMATIONAL);
        
        const fetchTasks = this.sources.map(async (source) => {
            try {
                const response = await fetch(source.url);
                if (!response.ok) return;
                const data = await response.text();
                await this.processSource(source, data);
            } catch (e) {
                this.logging.log(`[INTEL] Source failure (${source.name}): ${(e as Error).message}`, SyslogSeverity.WARNING);
            }
        });

        await Promise.all(fetchTasks);
        
        this.logging.log("[INTEL] Reputation weighting and perimeter enforcement complete.", SyslogSeverity.NOTICE);
    }

    private async processSource(source: any, data: string) {
        const lines = data.split("\n");
        let ingestCount = 0;
        let blockCount = 0;

        for (const line of lines) {
            if (!line || line.startsWith("#") || line.length < 5) continue;

            let indicator = line.trim();
            if (source.name === "Abuse.ch") {
                const parts = line.split(",");
                if (parts.length > 1) indicator = parts[1].replace(/"/g, "");
            }

            // 1. Sanity Check (Allowlist)
            if (this.allowlist.some(a => indicator.startsWith(a))) continue;

            // 2. Fetch existing reputation to correlate
            const existing = await this.kv?.get<IntelIndicator>(["curated_threats", indicator]);
            const weight = SOURCE_WEIGHTS[source.name] || 50;
            
            let curated: IntelIndicator;
            if (existing?.value) {
                // Cross-Correlation Boost: Increase score if seen in multiple sources
                curated = {
                    ...existing.value,
                    score: Math.min(100, existing.value.score + (weight * 0.5)),
                    lastSeen: new Date().toISOString()
                };
            } else {
                curated = {
                    indicator,
                    type: source.type,
                    provider: source.name,
                    confidence: weight,
                    threatType: "Malicious Infrastructure",
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    score: weight,
                    ttl: 72 // 72h default TTL
                };
            }

            // 3. Tiered Enforcement Policy
            if (curated.score >= 85 && curated.type === "IP") {
                // Tier 01: High Confidence Block
                await this.firewall.blockIp(curated.indicator).catch(() => {});
                this.blacklist.add(curated.indicator);
                blockCount++;
            } else if (curated.score >= 60 && curated.type === "IP") {
                // Tier 02: Suspicious - Shadow Ban
                await this.firewall.shadowBanIp(curated.indicator).catch(() => {});
                this.blacklist.delete(curated.indicator); // Ensure it's not in full block if it degraded
            } else {
                this.blacklist.delete(curated.indicator);
            }

            await this.kv?.set(["curated_threats", indicator], curated, { expireIn: curated.ttl * 60 * 60 * 1000 });
            ingestCount++;
            if (ingestCount > 300) break; // Keep KV churn manageable
        }

        this.logging.log(`[INTEL] Ingested ${ingestCount} from ${source.name} (Active Blocks: ${blockCount})`, SyslogSeverity.DEBUG);
    }

    async getRecentThreats(limit = 10): Promise<IntelIndicator[]> {
        if (!this.kv) return [];
        const iter = this.kv.list<IntelIndicator>({ prefix: ["curated_threats"] }, { limit, reverse: true });
        const threats: IntelIndicator[] = [];
        for await (const res of iter) {
            threats.push(res.value);
        }
        return threats;
    }
}
