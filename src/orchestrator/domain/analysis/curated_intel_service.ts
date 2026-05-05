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
        { name: "TalosIntelligence", url: "https://www.talosintelligence.com/documents/ip-blacklist", type: "IP" },
        { name: "FireHOL_L1", url: "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset", type: "IP" },
        { name: "FireHOL_L2", url: "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level2.netset", type: "IP" },
        { name: "AlienVault", url: "https://reputation.alienvault.com/reputation.data", type: "IP" },
        { name: "Spamhaus", url: "https://www.spamhaus.org/drop/drop.txt", type: "IP" }
    ];

    private allowlist: string[] = [];
    private blacklist: Set<string> = new Set();

    constructor(
        private logging: LoggingPort, 
        private firewall: any, 
        private config: ConfigurationPort,
        private broadcast: (data: any) => void
    ) {
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

    async sync(providerName?: string) {
        const logData = {
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "threat-intel",
            message: providerName ? `Initiating targeted sync for provider: ${providerName}` : "Fetching forensic threat intelligence from external databases"
        };
        this.logging.log(logData);
        this.broadcast(logData);
        
        let newThreatsFound = 0;
        
        const sourcesToSync = providerName 
            ? this.sources.filter(s => s.name === providerName)
            : this.sources;

        const fetchTasks = sourcesToSync.map(async (source) => {
            try {
                // Use a short timeout for intelligence fetches to prevent hanging the pipeline
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15s for larger feeds
                
                const response = await fetch(source.url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) return;
                const data = await response.text();
                const count = await this.processSource(source, data);
                newThreatsFound += count;
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

        if (newThreatsFound === 0) {
            const successLog = {
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "threat-intel",
                message: providerName ? `Targeted sync for ${providerName} complete. No new indicators.` : "Intelligence synchronization complete. No new malicious indicators discovered."
            };
            this.logging.log(successLog);
            this.broadcast(successLog);
        } else {
            const completeLog = {
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "threat-intel",
                message: providerName ? `Targeted sync for ${providerName} complete. Found ${newThreatsFound} new threats.` : `Intelligence synchronization complete. Identified and blocked ${newThreatsFound} new malicious threats.`
            };
            this.logging.log(completeLog);
            this.broadcast(completeLog);
        }
    }

    private async processSource(source: any, data: string): Promise<number> {
        const lines = data.split("\n");
        let ingestCount = 0;
        let blockCount = 0;
        let newIPsBlocked = 0;

        for (const line of lines) {
            if (!line || line.startsWith("#") || line.length < 5) continue;

            let indicator = line.trim();
            if (source.name === "Abuse.ch") {
                const parts = line.split(",");
                if (parts.length > 1) indicator = parts[1].replace(/"/g, "");
            }

            if (this.allowlist.some(a => indicator.startsWith(a))) continue;

            const existing = await this.kv?.get<IntelIndicator>(["curated_threats", indicator]);
            const isNewToDatabase = !existing?.value;
            
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
                if (isNewToDatabase) {
                    const foundLog = {
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "threat-intel",
                        message: `New malicious IP identified: ${curated.indicator} (Confidence: ${curated.confidence}%)`,
                        payload: { indicator: curated.indicator, source: source.name }
                    };
                    this.logging.log(foundLog);
                    this.broadcast(foundLog);
                }

            // SEPARATION OF CONCERNS: Ingest signals into the local ledger for browsing/analysis.
            // Enforcement (Firewall Commitment) is handled explicitly by operator actions or 
            // by a separate Active Defense cycle to avoid saturating the perimeter with cold intelligence.
            
            this.blacklist.delete(curated.indicator);

            await this.kv?.set(["curated_threats", indicator], curated, { expireIn: curated.ttl * 60 * 60 * 1000 });
            ingestCount++;
            if (ingestCount > 100000) break; 
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "threat-intel",
            message: `Ingested ${ingestCount} from ${source.name} (Active Blocks: ${blockCount})`
        });
        return newIPsBlocked;
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

    async getThreats(options: { type?: string; provider?: string; limit?: number; offset?: string; search?: string } = {}): Promise<{ threats: IntelIndicator[], nextCursor?: string }> {
        if (!this.kv) return { threats: [] };
        
        const { type, provider, limit = 50, offset, search } = options;
        const iter = this.kv.list<IntelIndicator>(
            { prefix: ["curated_threats"] }, 
            { cursor: offset } 
        );
        
        const threats: IntelIndicator[] = [];
        let cursor = "";

        for await (const res of iter) {
            const t = res.value;
            
            // Apply filters
            const matchesType = !type || t.type === type;
            const matchesProvider = !provider || t.provider === provider;
            const matchesSearch = !search || t.indicator.includes(search);
            
            if (matchesType && matchesProvider && matchesSearch) {
                // Real-time check for block status
                const blocked = await this.firewall.isBlocked(t.indicator);
                threats.push({ ...t, blocked } as any);
            }
            
            // Always update cursor to the last processed item
            cursor = iter.cursor;

            if (threats.length >= limit) break;
        }

        return { threats, nextCursor: cursor };
    }

    async getRecentThreats(limit = 10): Promise<IntelIndicator[]> {
        const { threats } = await this.getThreats({ limit });
        return threats;
    }

    async getStats(): Promise<Record<string, number>> {
        const stats: Record<string, number> = {};
        for (const source of this.sources) {
            stats[source.name] = 0;
        }

        if (!this.kv) return stats;
        const iter = this.kv.list<IntelIndicator>({ prefix: ["curated_threats"] });
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
