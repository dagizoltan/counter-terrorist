import { Plugin } from "../services/plugin_manager.ts";
import { FirewallPort } from "../core/ports.ts";

export class FirewallPlugin implements Plugin {
  name = "firewall";
  private active = false;

  constructor(private firewall: FirewallPort) {}

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    const status = await this.firewall.getStatus();
    if (status.success) {
      this.active = true;
      console.log("[FIREWALL-PLUGIN] Firewall service plugin started.");
    } else {
      console.error("[FIREWALL-PLUGIN] Failed to start: Firewall is unavailable.");
      this.active = false;
    }
  }

  async stop() {
    this.active = false;
    console.log("[FIREWALL-PLUGIN] Firewall service plugin stopped.");
  }

  async blockIp(ip: string) {
    return await this.firewall.blockIp(ip);
  }

  async unblockIp(ip: string) {
    return await this.firewall.unblockIp(ip);
  }
}
