import { Plugin } from "../plugin_manager.ts";
import { FirewallPort } from "@core/ports.ts";

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
      console.log("[FIREWALL-PLUGIN] Firewall service plugin started (Native).");
    } else {
      console.warn("[FIREWALL-PLUGIN] Native firewall (ufw) restricted. Starting in SOFTWARE-ONLY mode.");
      this.active = true; // Still allow it to be active for process-level protection
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
