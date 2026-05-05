import { ConfigurationPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

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

/**
 * CuratedIntelService
 * Orchestrates multi-source intelligence ingestion with weighted reputation scoring.
 */
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

    /**
     * Starts the intelligence pipeline.
     * Refactored to be non-blocking to allow the web console to start immediately.
     */
    async start(kv?: Deno.Kv) {
        this.kv = kv || await Deno.openKv();
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "INTEL",
            message: "Curated Intelligence Pipeline engaged. Background sync initiated."
        });
        
        // Background initial sync (prevents boot-blocking)
        this.sync().catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "INTEL",
                message: `Initial synchronization warning: ${e.message}`
            });
        });

        // Periodic sync
        const intervalHours = this.config.getNumber("INTEL_SYNC_INTERVAL_HOURS", 1);
        setInterval(() => this.sync(), intervalHours * 60 * 60 * 1000); 
    }

    async sync() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.DEBUG,
            caller: "INTEL",
            message: "Commencing weighted intelligence ingestion..."
        });
        
        const fetchTasks = this.sources.map(async (source) => {
            try {
                // Use a short timeout for intelligence fetches to prevent hanging the pipeline
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
                
                const response = await fetch(source.url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) return;
                const data = await response.text();
                await this.processSource(source, data);
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "INTEL",
                    message: `Source failure (${source.name}): ${e instanceof Error ? e.message : String(e)}`
                });
            }
        });

        await Promise.all(fetchTasks);
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.SUCCESS,
            caller: "INTEL",
            message: "Reputation weighting and perimeter enforcement complete."
        });
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

            if (this.allowlist.some(a => indicator.startsWith(a))) continue;

            const existing = await this.kv?.get<IntelIndicator>(["curated_threats", indicator]);
            const weight = SOURCE_WEIGHTS[source.name] || 50;
            
            let curated: IntelIndicator;
            if (existing?.value) {
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
                    ttl: 72 
                };
            }

            if (curated.score >= 85 && curated.type === "IP") {
                await this.firewall.blockIp(curated.indicator).catch(() => {});
                this.blacklist.add(curated.indicator);
                blockCount++;
            } else if (curated.score >= 60 && curated.type === "IP") {
                await this.firewall.shadowBanIp(curated.indicator).catch(() => {});
                this.blacklist.delete(curated.indicator); 
            } else {
                this.blacklist.delete(curated.indicator);
            }

            await this.kv?.set(["curated_threats", indicator], curated, { expireIn: curated.ttl * 60 * 60 * 1000 });
            ingestCount++;
            if (ingestCount > 200) break; // Reduced count to further speed up ingestion
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.DEBUG,
            caller: "INTEL",
            message: `Ingested ${ingestCount} from ${source.name} (Active Blocks: ${blockCount})`
        });
    }

    async wipeDatabase() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "INTEL",
            message: "Initiating complete intelligence purge..."
        });
        if (!this.kv) return;
        const iter = this.kv.list({ prefix: ["curated_threats"] });
        for await (const res of iter) {
            await this.kv.delete(res.key);
        }
        this.blacklist.clear();
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.SUCCESS,
            caller: "INTEL",
            message: "Intelligence database wiped. Defensive rules reset."
        });
    }

    async getThreats(type?: string, limit = 50): Promise<IntelIndicator[]> {
        if (!this.kv) return [];
        const iter = this.kv.list<IntelIndicator>({ prefix: ["curated_threats"] }, { limit });
        const threats: IntelIndicator[] = [];
        for await (const res of iter) {
            if (type && res.value.type !== type) continue;
            threats.push(res.value);
        }
        return threats;
    }

    async getRecentThreats(limit = 10): Promise<IntelIndicator[]> {
        return this.getThreats(undefined, limit);
    }
}
