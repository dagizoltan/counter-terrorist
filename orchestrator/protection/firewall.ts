import { broadcast } from "../api/ws.ts";
import { meshManager } from "../services/mesh.ts";
import { FirewallProvider } from "./interfaces.ts";

export class FirewallManager {
  constructor(private provider: FirewallProvider) {}

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
