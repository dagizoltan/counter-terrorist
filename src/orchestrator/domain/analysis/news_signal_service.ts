import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";
import { BaseService } from "@core/base_service.ts";

export type TacticalSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface NewsItem {
    id: string;
    title: string;
    link: string;
    summary: string;
    source: string;
    timestamp: string;
    severity: TacticalSeverity;
    riskScore: number;
}

export class NewsSignalService extends BaseService {
    private kv?: Deno.Kv;
    private refreshInterval?: number;
    private feeds = [
        { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
        { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
        { name: "Bleeping Computer", url: "https://www.bleepingcomputer.com/feed/" },
        { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml" },
        { name: "Schneier on Security", url: "https://www.schneier.com/blog/index.rdf" },
        { name: "SANS ISC", url: "https://isc.sans.edu/rssfeed.xml" },
        { name: "SecurityWeek", url: "https://feeds.feedburner.com/securityweek" },
        { name: "CyberScoop", url: "https://cyberscoop.com/feed/" },
        { name: "CERT-UA", url: "https://cert.gov.ua/rss" }
    ];

    constructor(private logging: LoggingPort) {
        super();
    }

    async start(kv?: Deno.Kv): Promise<Result<void>> {
        this.kv = kv || await Deno.openKv();
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "NEWS",
            message: "Cybersec Signal Feed active."
        });
        
        // Initial fetch - background
        this.fetchFeeds().catch(() => {});

        // Refresh every 30 minutes
        this.refreshInterval = setInterval(() => this.fetchFeeds(), 30 * 60 * 1000);
        return ok(undefined);
    }

    private analyzeRisk(content: string): { severity: TacticalSeverity; score: number } {
        const keywords = {
            CRITICAL: ['zero-day', '0-day', 'unauthenticated rce', 'active exploitation', 'wild', 'critical vulnerability', 'cvss 10', 'ransomware attack'],
            HIGH: ['rce', 'exploit available', 'poc leaked', 'privilege escalation', 'data breach', 'millions of records', 'botnet', 'state-sponsored'],
            MEDIUM: ['vulnerability', 'security update', 'patch available', 'malware', 'phishing', 'advisory', 'incident'],
            LOW: ['report', 'survey', 'analysis', 'guide', 'best practices', 'interview', 'webinar']
        };

        let score = 0;
        const normalized = content.toLowerCase();

        for (const word of keywords.CRITICAL) if (normalized.includes(word)) score += 50;
        for (const word of keywords.HIGH) if (normalized.includes(word)) score += 20;
        for (const word of keywords.MEDIUM) if (normalized.includes(word)) score += 5;
        for (const word of keywords.LOW) if (normalized.includes(word)) score += 1;

        if (score >= 50) return { severity: 'CRITICAL', score };
        if (score >= 20) return { severity: 'HIGH', score };
        if (score >= 5) return { severity: 'MEDIUM', score };
        return { severity: 'LOW', score };
    }

    async fetchFeeds() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "NEWS",
            message: "Synchronizing tactical news signals..."
        });
        
        for (const feed of this.feeds) {
            try {
                // BUG-4.18 FIX: Use a streaming fetch with a size limit to prevent memory exhaustion
                const response = await fetch(feed.url);
                if (!response.ok) continue;
                
                // Limit XML payload to 512KB to prevent DoS
                const xml = await response.text().then(t => t.slice(0, 512 * 1024));
                
                // Safe parsing: avoid catastrophic backtracking by not using non-greedy [ \s\S]*? over large blocks.
                // We split the string instead.
                const items = xml.split(/<(?:item|entry)>/).slice(1);

                for (const itemContent of items.slice(0, 25)) {
                    const itemXml = "<item>" + itemContent.split(/<\/(?:item|entry)>/)[0] + "</item>";

                    const title = itemXml.match(/<(?:title|headline)>([\s\S]*?)<\/(?:title|headline)>/)?.[1]
                        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
                        ?.replace(/<[^>]+>/g, '') // Strip HTML tags
                        ?.trim() || "Untitled Signal";
                        
                    const linkMatch = itemXml.match(/<link[^>]*href=["'](.*?)["']/i) || itemXml.match(/<link>(.*?)<\/link>/i);
                    const link = linkMatch?.[1] || "#";
                    
                    const summaryMatch = itemXml.match(/<(?:description|summary|content)>([\s\S]*?)<\/(?:description|summary|content)>/);
                    const summary = summaryMatch?.[1]
                        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
                        ?.replace(/<[^>]+>/g, '') // Strip HTML tags
                        ?.slice(0, 300)
                        ?.trim() || "";
                    
                    const { severity, score } = this.analyzeRisk(title + " " + summary);
                    const id = btoa(encodeURIComponent(title)).slice(0, 16).replace(/\//g, '_');
                    
                    const item: NewsItem = {
                        id,
                        title,
                        link,
                        summary,
                        source: feed.name,
                        timestamp: new Date().toISOString(),
                        severity,
                        riskScore: score
                    };

                    await this.kv?.set(["news_signals", item.id], item, { expireIn: 48 * 60 * 60 * 1000 });
                }
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "NEWS",
                    message: `Feed sync failed (${feed.name}): ${(e as Error).message}`
                });
            }
        }
    }

    override async shutdown(): Promise<Result<void>> {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
        return ok(undefined);
    }

    async getLatestSignals(limit = 10): Promise<NewsItem[]> {
        if (!this.kv) return [];
        const iter = this.kv.list<NewsItem>({ prefix: ["news_signals"] }, { limit, reverse: true });
        const signals: NewsItem[] = [];
        for await (const res of iter) {
            signals.push(res.value);
        }
        return signals.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
}
