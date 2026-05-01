import { broadcast } from "@api/ws.ts";
import { meshManager } from "@domain/engine/mesh.ts";
import { isValidIP } from "../../validation.ts";
import { FirewallProvider } from "../interfaces.ts";
export type { FirewallProvider };

export class FirewallManager {
  constructor(private provider: FirewallProvider) {}

  async blockIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    broadcast({ type: "BLOCK", message: `Blocking malicious IP: ${ip}`, data: { ip } });

    if (meshManager) {
      meshManager.broadcastBlock(ip).catch(console.error);
    }

    return await this.provider.blockIp(ip);
  }

  async shadowBanIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    broadcast({ type: "WARNING", message: `Shadow Banning IP: ${ip} (Throttling to 1KB/s)`, data: { ip } });
    
    if (meshManager) {
      meshManager.broadcastBlock(ip).catch(console.error);
    }

    return await this.provider.shadowBanIp(ip);
  }

  async unblockIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    broadcast({ type: "INFO", message: `Unblocking IP: ${ip}` });
    return await this.provider.unblockIp(ip);
  }

  async killProcess(pid: number) {
    broadcast({ type: "CRITICAL", message: `Quarantining process (PID: ${pid})` });
    return await this.provider.killProcess(pid);
  }

  async getStatus() {
    return await this.provider.getStatus();
  }

  async lockdown() {
    broadcast({ type: "CRITICAL", message: "LOCKDOWN PROTOCOL INITIATED" });
    
    if (meshManager) {
      meshManager.broadcastLockdown().catch(console.error);
    }

    return await this.provider.lockdown();
  }
}
