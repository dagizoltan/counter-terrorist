import { ProtectionPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

export class ThreatIntelService extends BaseService {
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
    await this.init();
  }

  protected override async onInit(): Promise<Result<void>> {
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
            this.protection.firewall.blockIp(ip).catch((e: Error) => {
              this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:threat_intel",
                message: `Failed to block IP ${ip}: ${e.message}`
              });
            });
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

  protected override async onShutdown(): Promise<Result<void>> {
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
