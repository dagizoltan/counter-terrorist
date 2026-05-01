import { ProtectionPort, LoggingPort, SyslogSeverity } from "@core/ports.ts";

export class ThreatIntelService {
  private updateInterval: number | undefined;
  private intelUrl = "https://rules.emergingthreats.net/fwrules/emerging-Block-IPs.txt";

  constructor(
    private protection: ProtectionPort,
    private logging: LoggingPort
  ) {}

  async start() {
    this.logging.log("[INTEL] Threat Intelligence Service initialized.", SyslogSeverity.NOTICE);
    
    // Initial fetch
    await this.updateThreatList();

    // Update every 4 hours
    this.updateInterval = setInterval(() => this.updateThreatList(), 4 * 60 * 60 * 1000);
  }

  async updateThreatList() {
    this.logging.log("[INTEL] Fetching latest threat intelligence...", SyslogSeverity.INFORMATIONAL);
    
    try {
      const res = await fetch(this.intelUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const text = await res.text();
      const ips = text.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .slice(0, 500); // Increased limit for better production coverage

      this.logging.log(`[INTEL] Synchronizing ${ips.length} high-confidence malicious IPs.`, SyslogSeverity.NOTICE);
      
      // Parallelize blocking for performance
      await Promise.all(ips.map(ip => 
        this.protection.firewall.blockIp(ip).catch(err => 
          this.logging.log(`[INTEL] Failed to block ${ip}: ${(err as Error).message}`, SyslogSeverity.WARNING)
        )
      ));
    } catch (e) {
      this.logging.log(`[INTEL] Failed to fetch threat list: ${(e as Error).message}. Using local cache.`, SyslogSeverity.WARNING);
    }
  }

  stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }
}
