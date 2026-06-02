import { ProtectionPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export class ThreatIntelService {
  private intelSources = [
    "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt",
    "https://feodotracker.abuse.ch/downloads/ipblocklist.txt"
  ];
  private blacklist: Set<string> = new Set();
  private updateInterval?: any;

  constructor(
    private protection: ProtectionPort,
    private logging: LoggingPort
  ) {}

  async start() {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:protection:threat_intel",
        message: "Threat Intelligence Service initialized with multi-source ingestion."
    });
    
    // Initial fetch
    await this.updateThreatList();

    // Update every 4 hours
    this.updateInterval = setInterval(() => this.updateThreatList(), 4 * 60 * 60 * 1000);
  }

  getBlacklist(): Set<string> {
    return this.blacklist;
  }

  async updateThreatList() {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:protection:threat_intel",
        message: "Synchronizing threat intelligence from multiple distributed databases..."
    });
    
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
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:protection:threat_intel",
            message: `Source ${url} failed: ${(e as Error).message}`
        });
      }
    }
    
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.SUCCESS,
        caller: "orchestrator:domain:protection:threat_intel",
        message: `Threat database synchronized. ${this.blacklist.size} unique malicious IPs tracked.`
    });
  }

  async shutdown(): Promise<import("@core/result.ts").Result<void>> {
    const { ok } = await import("@core/result.ts");
    if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = undefined;
    }
    return ok(undefined);
  }

  stop() {
    this.shutdown();
  }
}
