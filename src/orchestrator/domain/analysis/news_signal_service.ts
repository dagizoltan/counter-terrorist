import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface NewsItem {
    id: string;
    title: string;
    link: string;
    summary: string;
    source: string;
    timestamp: string;
}

export class NewsSignalService {
    private kv?: Deno.Kv;
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

    constructor(private logging: LoggingPort) {}

    async start() {
        this.kv = await Deno.openKv();
        this.logging.log("[NEWS] Cybersec Signal Feed active.", SyslogSeverity.NOTICE);
        
        // Initial fetch - background
        this.fetchFeeds().catch(() => {});

        // Refresh every 30 minutes
        setInterval(() => this.fetchFeeds(), 30 * 60 * 1000);
    }

    async fetchFeeds() {
        this.logging.log("[NEWS] Synchronizing tactical news signals...", SyslogSeverity.DEBUG);
        
        for (const feed of this.feeds) {
            try {
                const response = await fetch(feed.url);
                if (!response.ok) continue;
                const xml = await response.text();
                
                // Simple regex-based RSS parsing to avoid large dependencies
                const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
                
                for (const itemXml of items.slice(0, 25)) {
                    const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1") || "Untitled Signal";
                    const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || "#";
                    const summary = itemXml.match(/<description>(.*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")?.slice(0, 200) + "..." || "";
                    
                    const id = btoa(encodeURIComponent(title)).slice(0, 16);
                    const item: NewsItem = {
                        id,
                        title,
                        link,
                        summary,
                        source: feed.name,
                        timestamp: new Date().toISOString()
                    };

                    await this.kv?.set(["news_signals", item.id], item, { expireIn: 48 * 60 * 60 * 1000 });
                }
            } catch (e) {
                this.logging.log(`[NEWS] Feed sync failed (${feed.name}): ${(e as Error).message}`, SyslogSeverity.WARNING);
            }
        }
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
