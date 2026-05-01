import { ProtectionPort, LoggingPort, SyslogSeverity } from "@core/ports.ts";

export class ThreatIntelService {
  private intelSources = [
    "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt",
    "https://feodotracker.abuse.ch/downloads/ipblocklist.txt"
  ];
  private blacklist: Set<string> = new Set();
  private updateInterval?: number;

  constructor(
    private protection: ProtectionPort,
    private logging: LoggingPort
  ) {}

  async start() {
    this.logging.log("[INTEL] Threat Intelligence Service initialized with multi-source ingestion.", SyslogSeverity.NOTICE);
    
    // Initial fetch
    await this.updateThreatList();

    // Update every 4 hours
    this.updateInterval = setInterval(() => this.updateThreatList(), 4 * 60 * 60 * 1000);
  }

  getBlacklist(): Set<string> {
    return this.blacklist;
  }

  async updateThreatList() {
    this.logging.log("[INTEL] Synchronizing threat intelligence from multiple distributed databases...", SyslogSeverity.INFORMATIONAL);
    
    let totalLoaded = 0;
    for (const url of this.intelSources) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        
        const text = await res.text();
        const ips = text.split("\n")
          .map(line => line.trim())
          .filter(line => line && !line.startsWith("#") && !line.startsWith("//"))
          .slice(0, 1000);

        for (const ip of ips) {
          if (!this.blacklist.has(ip)) {
            this.blacklist.add(ip);
            totalLoaded++;
            // Still attempt to block via firewall sidecar for system-level protection
            this.protection.firewall.blockIp(ip).catch(() => {});
          }
        }
      } catch (e) {
        this.logging.log(`[INTEL] Source ${url} failed: ${(e as Error).message}`, SyslogSeverity.WARNING);
      }
    }
    
    this.logging.log(`[INTEL] Threat database synchronized. ${this.blacklist.size} unique malicious IPs tracked.`, SyslogSeverity.NOTICE);
  }

  stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }
}
