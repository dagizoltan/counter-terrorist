import { Plugin } from "../plugin_manager.ts";
import { FirewallPort, LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";

export class FirewallPlugin implements Plugin {
  name = "firewall";
  description = "Manages kernel-level packet filtering and process-level quarantine rules.";
  private active = false;

  constructor(private firewall: FirewallPort) {}

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    const status = await this.firewall.getStatus();
    if (status.success) {
      this.active = true;
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "FIREWALL-PLUGIN",
          message: "Firewall service plugin started (Native)."
      });
    } else {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "FIREWALL-PLUGIN",
          message: "Native firewall (ufw) restricted. Starting in SOFTWARE-ONLY mode."
      });
      this.active = true; // Still allow it to be active for process-level protection
    }
  }

  async stop() {
    this.active = false;
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "FIREWALL-PLUGIN",
        message: "Firewall service plugin stopped."
    });
  }

  async blockIp(ip: string) {
    return await this.firewall.blockIp(ip);
  }

  async unblockIp(ip: string) {
    return await this.firewall.unblockIp(ip);
  }
}
