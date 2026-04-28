import { broadcast } from "../api/ws.ts";
import { meshManager } from "../services/mesh.ts";
import { FirewallProvider } from "./interfaces.ts";
import { UbuntuFirewallProvider } from "./ubuntu_firewall.ts";
import { WindowsFirewallProvider } from "./windows_firewall.ts";

export class FirewallManager {
  private provider: FirewallProvider;

  constructor() {
    const os = Deno.build.os;
    if (os === "windows") {
        this.provider = new WindowsFirewallProvider();
    } else {
        this.provider = new UbuntuFirewallProvider();
    }
  }

  async blockIp(ip: string) {
    console.log(`[FIREWALL] Requesting block for IP: ${ip}`);
    broadcast({ type: "BLOCK", message: `Blocking malicious IP: ${ip}` });

    // Mesh Gossip (Phase 4)
    meshManager.broadcastBlock(ip).catch(console.error);

    return await this.provider.blockIp(ip);
  }

  async unblockIp(ip: string) {
    console.log(`[FIREWALL] Requesting unblock for IP: ${ip}`);
    broadcast({ type: "INFO", message: `Unblocking IP: ${ip}` });
    return await this.provider.unblockIp(ip);
  }

  async getStatus() {
    return await this.provider.getStatus();
  }
}

export const firewall = new FirewallManager();
