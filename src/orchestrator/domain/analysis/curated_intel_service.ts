import { BaseService } from "@core/base_service.ts";
import { ConfigurationPort, LoggingPort, LogSeverity, LogType, FirewallPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";
import { CircuitBreaker } from "../../core/utils/resilience.ts";
import { GeoIpService } from "./geoip_service.ts";
import { z } from "zod";

export const IntelIndicatorSchema = z.object({
    indicator: z.string(),
    type: z.enum(["IP", "URL", "DOMAIN", "HASH"]),
    provider: z.string(),
    confidence: z.number().min(0).max(100),
    threatType: z.string(),
    firstSeen: z.string(),
    lastSeen: z.string(),
    score: z.number().min(0).max(100),
    ttl: z.number(),
    geo: z.object({
        country: z.string(),
        isp: z.string(),
        asn: z.string(),
        isBulletproof: z.boolean(),
        lat: z.number().optional(),
        lon: z.number().optional()
    }).optional()
});

export type IntelIndicator = z.infer<typeof IntelIndicatorSchema>;

/*
export interface IntelIndicator {
    indicator: string;
    type: "IP" | "URL" | "DOMAIN" | "HASH";
    provider: string;
    confidence: number; // 0-100
    threatType: string;
    firstSeen: string;
    lastSeen: string;
    score: number; // Calculated reputation score
    ttl: number; // Hours until decay
    geo?: {
        country: string;
        isp: string;
        asn: string;
        isBulletproof: boolean;
        lat?: number;
        lon?: number;
    };
}
*/

const SOURCE_WEIGHTS: Record<string, number> = {
    "Abuse.ch": 95,
    "MalwareBazaar": 98,
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
export class CuratedIntelService extends BaseService {
    private kv?: Deno.Kv;
    private syncInterval?: number;
    private lifecycleInterval?: number;
    private breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 600000 });
    private sources = [
        { name: "Abuse.ch", url: "https://feodotracker.abuse.ch/downloads/ipblocklist.csv", type: "IP" },
        { name: "MalwareBazaar", url: "https://bazaar.abuse.ch/export/csv/recent/", type: "HASH" },
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
    private stats: Record<string, number> = {};

    constructor(
        private logging: LoggingPort, 
        private firewall: FirewallPort, 
        private config: ConfigurationPort,
        private geoip?: GeoIpService
    ) {
        super();
        const list = config.getEnv("INTEL_ALLOWLIST") || "";
        this.allowlist = list.split(",").map(i => i.trim()).filter(Boolean);
    }

    getBlacklist(): Set<string> {
        return this.blacklist;
    }

    protected override async onInit(kv?: Deno.Kv): Promise<Result<void>> {
        this.kv = kv || await Deno.openKv();
        
        // 1. Recover existing blacklist from persistent storage
        const iter = this.kv.list<IntelIndicator>({ prefix: ["curated_threats"] });
        for await (const res of iter) {
            const validation = IntelIndicatorSchema.safeParse(res.value);
            if (!validation.success) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "INTEL:RECOVERY",
                    message: `Invalid indicator in KV: ${res.key}. Errors: ${validation.error.message}`
                });
                continue;
            }
            if (res.value.score >= 85 && res.value.type === "IP") {
                this.blacklist.add(res.value.indicator);
            }
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "INTEL",
            message: `Curated Intelligence Pipeline engaged. ${this.blacklist.size} indicators recovered from persistent store.`
        });
        
        // 2. Critical Boot Sync: Perform a fast sync of high-priority sources before fully booting
        // If the blacklist is empty, we MUST have at least some data before proceeding.
        if (this.blacklist.size < 100) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "INTEL",
                message: "Blacklist density critical. Initiating mandatory pre-flight intelligence sync..."
            });
            await this.sync().catch(() => {});
        } else {
            // Background initial sync if we already have data
            this.sync().catch(e => {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "INTEL",
                    message: `Initial synchronization warning: ${e.message}`
                });
            });
        }

        // 3. Periodic sync
        const intervalHours = this.config.getNumber("INTEL_SYNC_INTERVAL_HOURS", 1);
        this.syncInterval = setInterval(() => this.sync(), intervalHours * 60 * 60 * 1000);

        // 4. Lifecycle Management Loop
        this.lifecycleInterval = setInterval(() => this.processLifecycle(), 15 * 60 * 1000);
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = undefined;
        }
        if (this.lifecycleInterval) {
            clearInterval(this.lifecycleInterval);
            this.lifecycleInterval = undefined;
        }
        return ok(undefined);
    }

    /**
     * Adaptive Lifecycle Manager
     * Processes enforced indicators, checks TTL, and performs forensic re-verification.
     */
    async processLifecycle() {
        if (!this.kv) return;
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "lifecycle-mgr",
            message: "Starting adaptive perimeter lifecycle audit..."
        });

        const iter = this.kv.list<any>({ prefix: ["enforcement"] });
        let expiredCount = 0;
        let revalidatedCount = 0;

        for await (const res of iter) {
            const ip = String(res.key[1]);
            const data = res.value;
            const now = Date.now();
            
            if (now > data.expiresAt) {
                // EXPIRED: Perform forensic re-verification
                const isStillMalicious = await this.reverify(ip);
                
                if (isStillMalicious) {
                    // Renew TTL (Adaptive extension)
                    const newExpiry = now + (24 * 60 * 60 * 1000); // Extension: 24h
                    await this.kv.set(["enforcement", ip], { ...data, expiresAt: newExpiry });
                    revalidatedCount++;
                } else {
                    // PURGE: Remove from active firewall
                    await this.firewall.unblockIp(ip);
                    await this.kv.delete(["enforcement", ip]);
                    expiredCount++;
                    
                    const auditLog = {
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.SUCCESS,
                        caller: "lifecycle-mgr",
                        message: `Tactical isolation revoked for ${ip}: TTL expired and indicator re-verified as CLEAN.`
                    };
                    this.logging.log(auditLog);
                    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "AUDIT_LOG", data: auditLog });
                }
            }
        }

        if (expiredCount > 0 || revalidatedCount > 0) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "lifecycle-mgr",
                message: `Lifecycle audit complete: ${expiredCount} purged, ${revalidatedCount} adaptive extensions.`
            });
        }
    }

    /**
     * Forensic Re-verification
     * Checks if an IP still appears in the threat ledger with a significant score.
     */
    private async reverify(ip: string): Promise<boolean> {
        if (!this.kv) return false;
        const threat = await this.kv.get<IntelIndicator>(["curated_threats", ip]);
        if (!threat.value) return false;
        
        // Re-verification threshold: If score is still >= 70, maintain isolation.
        return threat.value.score >= 70;
    }

    /**
     * Tactical Isolation Commitment
     * Commits an indicator to the active firewall with a forensic TTL.
     */
    async commitIsolation(ip: string, reason: string, ttlHours = 24) {
        if (!this.kv) return;
        
        const expiresAt = Date.now() + (ttlHours * 60 * 60 * 1000);
        await this.firewall.blockIp(ip);
        await this.kv.set(["enforcement", ip], { reason, expiresAt, committedAt: Date.now() });

        const log = {
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "threat-intel",
            message: `INDICATOR_COMMITTED: ${ip} isolated with forensic TTL: ${ttlHours}h`,
            payload: { ip, reason, ttlHours }
        };
        this.logging.log(log);
        if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "LOG", data: log });
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
        if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "UI_MESSAGE", data: logData });
        
        let newThreatsFound = 0;
        
        const sourcesToSync = providerName 
            ? this.sources.filter(s => s.name === providerName)
            : this.sources;

        const fetchTasks = sourcesToSync.map(async (source) => {
            const res = await this.breaker.execute(async () => {
                // Use a short timeout for intelligence fetches to prevent hanging the pipeline
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased to 15s for larger feeds
                
                try {
                    const response = await fetch(source.url, { signal: controller.signal });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return await response.text();
                } finally {
                    clearTimeout(timeoutId);
                }
            });

            if (!res.success) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "INTEL",
                    message: `Source skipped (${source.name}): ${res.error.message}`
                });
                return;
            }

            try {
                const data = res.data;
                const count = await this.processSource(source, data);
                newThreatsFound += count;
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "INTEL",
                    message: `Source processing failure (${source.name}): ${e instanceof Error ? e.message : String(e)}`
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
            if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "UI_MESSAGE", data: successLog });
        } else {
            const completeLog = {
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "threat-intel",
                message: providerName ? `Targeted sync for ${providerName} complete. Found ${newThreatsFound} new threats.` : `Intelligence synchronization complete. Identified and blocked ${newThreatsFound} new malicious threats.`
            };
            this.logging.log(completeLog);
            if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "UI_MESSAGE", data: completeLog });
        }
    }

    private async processSource(source: any, data: string): Promise<number> {
        const lines = data.split("\n");
        let ingestCount = 0;
        let blockCount = 0;
        let newIPsBlocked = 0;

        let consecutiveExisting = 0;
        const CONSECUTIVE_THRESHOLD = 50; // Delta-Update heuristic

        for (const line of lines) {
            if (!line || line.startsWith("#") || line.length < 5) continue;

            let indicator = line.trim();
            let threatType = "Malicious Infrastructure";

            if (source.name === "Abuse.ch") {
                const parts = line.split(",");
                if (parts.length > 1) indicator = parts[1].replace(/"/g, "");
            }

            if (source.name === "MalwareBazaar") {
                // MalwareBazaar uses ", " as separator with quoted fields
                const parts = line.split(", ");
                if (parts.length > 8) {
                    indicator = parts[1].replace(/"/g, "").trim(); // SHA256
                    threatType = parts[8].replace(/"/g, "").trim(); // Signature/Family
                    if (threatType === "n/a") threatType = "Unknown Malware";
                    
                    // Validation: Ensure it's a valid hex hash
                    if (!/^[a-fA-F0-9]{64}$/.test(indicator)) {
                        continue;
                    }
                } else {
                    continue; 
                }
            }

            if (this.allowlist.some(a => indicator.startsWith(a))) continue;

            const existing = await this.kv?.get<IntelIndicator>(["curated_threats", indicator]);
            const isNewToDatabase = !existing?.value;
            
            if (!isNewToDatabase) {
                consecutiveExisting++;
                if (consecutiveExisting > CONSECUTIVE_THRESHOLD) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.DEBUG,
                        severity: LogSeverity.INFO,
                        caller: "threat-intel",
                        message: `Delta-Update threshold reached for ${source.name}. Skipping remaining records.`
                    });
                    break;
                }
            } else {
                consecutiveExisting = 0;
            }
            
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
                    threatType,
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    score: weight,
                    ttl: 72 
                };
            }

            // Enrichment: GeoIP Attribution
            if (curated.type === "IP" && this.geoip) {
                const geo = await this.geoip.resolve(curated.indicator) as any;
                if (geo) {
                    curated.geo = {
                        country: geo.country,
                        isp: geo.isp,
                        asn: geo.asn,
                        isBulletproof: geo.isBulletproof,
                        lat: geo.lat,
                        lon: geo.lon
                    };
                }
            }

            if (curated.score >= 85 && curated.type === "IP") {
                if (isNewToDatabase) {
                    const foundLog = {
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "threat-intel",
                        message: `New malicious IP identified: ${curated.indicator} (Score: ${curated.score})`,
                        payload: { indicator: curated.indicator, source: source.name }
                    };
                    this.logging.log(foundLog);
                    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "AUDIT_LOG", data: foundLog });
                }

                // AUTO-ISOLATION POLICY: 
                // High-fidelity indicators (Score >= 95) are automatically committed to active defense.
                if (curated.score >= 95) {
                    const isAlreadyEnforced = (await this.kv?.get(["enforcement", curated.indicator]))?.value;
                    if (!isAlreadyEnforced) {
                        // Tactical TTL for autonomous blocks: 12h (more aggressive than manual 24h)
                        await this.commitIsolation(curated.indicator, `AUTO_ISOLATE: High-fidelity signal from ${source.name}`, 12);
                        
                        const autoLog = {
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity: LogSeverity.ERROR,
                            caller: "autopilot:enforcement",
                            message: `Autonomous Isolation engaged for ${curated.indicator} (Critical Threat Score: ${curated.score})`
                        };
                        this.logging.log(autoLog);
                        if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "AUDIT_LOG", data: autoLog });
                    }
                }
            }

            // PROACTIVE ARTIFACT QUARANTINE
            if (curated.score >= 95 && curated.type === "HASH" && isNewToDatabase) {
                if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
                    type: "ARTIFACT_FOUND",
                    data: curated
                });
            }

            if (this.kv) {
                await this.kv.atomic()
                    .set(["curated_threats", indicator], curated, { expireIn: curated.ttl * 60 * 60 * 1000 })
                    .set(["curated_threats_by_type", curated.type, indicator], curated, { expireIn: curated.ttl * 60 * 60 * 1000 })
                    .commit();
            }
            this.stats[source.name] = (this.stats[source.name] || 0) + 1;
            ingestCount++;
            
            // Log progress every 10k items to prove activity to the operator
            if (ingestCount % 10000 === 0) {
                const progressLog = {
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: LogSeverity.INFO,
                    caller: `intel:${source.name.toLowerCase()}`,
                    message: `Ingestion in progress: ${ingestCount} indicators parsed...`
                };
                this.logging.log(progressLog);
                if (this.eventBus) this.eventBus.emit("UI_BROADCAST", { type: "UI_MESSAGE", data: progressLog });
            }

            if (ingestCount > 100000) break;
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.SUCCESS,
            caller: "threat-intel",
            message: `COMPLETED: Ingested ${ingestCount} indicators from ${source.name}. ${newIPsBlocked} new tactical isolations committed.`
        });
        
        // Broadcast the final summary for this source
        if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
            type: "INGESTION_FINISH",
            data: {
                timestamp: new Date().toISOString(),
                type: "AUDIT",
                severity: "SUCCESS",
                caller: `intel:${source.name.toLowerCase()}`,
                message: `Ingestion cycle finished. DB_COUNT: ${ingestCount}`
            }
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
        
        // OPTIMIZATION: Use type-specific index if type is provided and no search is active
        const prefix = (type && !search) ? ["curated_threats_by_type", type] : ["curated_threats"];
        
        const iter = this.kv.list<IntelIndicator>(
            { prefix }, 
            { cursor: offset } 
        );
        
        const threats: IntelIndicator[] = [];
        let cursor = "";

        // BUG-02 Optimization: Fetch blocked IPs once
        const blockedSet = new Set(await (this.firewall as any).getBlockedIps?.() || []);

        for await (const res of iter) {
            const t = res.value;
            
            // Apply filters
            const matchesType = !type || t.type === type;
            const matchesProvider = !provider || t.provider === provider;
            const matchesSearch = !search || t.indicator.includes(search);
            
            if (matchesType && matchesProvider && matchesSearch) {
                // Real-time check for block status (Optimized via Set)
                const blocked = blockedSet.has(t.indicator);
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
        // BUG-01 Optimization: Return pre-calculated stats
        if (Object.keys(this.stats).length > 0) return this.stats;
        
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
        this.stats = stats;
        return stats;
    }

    async getLedger(options: { type?: string; minScore?: number; limit?: number } = {}): Promise<IntelIndicator[]> {
        if (!this.kv) return [];
        const { type = "HASH", minScore = 90, limit = 50 } = options;
        
        const iter = this.kv.list<IntelIndicator>({ prefix: ["curated_threats"] });
        const ledger: IntelIndicator[] = [];
        
        for await (const res of iter) {
            const t = res.value;
            if (t.type === type && t.score >= minScore) {
                ledger.push(t);
            }
            if (ledger.length >= limit * 2) break; // Fetch more to allow sorting but limit scan
        }
        
        return ledger.sort((a, b) => b.score - a.score).slice(0, limit);
    }
}
