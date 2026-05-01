import { broadcast } from "@api/ws.ts";
import { meshManager } from "@domain/engine/mesh.ts";
import { isValidIP } from "../../validation.ts";
import { FirewallProvider } from "../interfaces.ts";
export type { FirewallProvider };

export class FirewallManager {
  private blockedIps: Set<string> = new Set();

  constructor(private provider: FirewallProvider, private networkLogs?: any) {}

  async blockIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    this.blockedIps.add(ip);
    broadcast({ type: "BLOCK", message: `Blocking malicious IP: ${ip}`, data: { ip } });

    if (this.networkLogs) {
        await this.networkLogs.log({
            direction: "INBOUND",
            source: ip,
            destination: "LOCAL",
            protocol: "ANY",
            length: 0,
            action: "BLOCK"
        });
    }

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
    
    if (this.networkLogs) {
        await this.networkLogs.log({
            direction: "INBOUND",
            source: ip,
            destination: "LOCAL",
            protocol: "ANY",
            length: 0,
            action: "SHADOW"
        });
    }

    if (meshManager) {
      meshManager.broadcastBlock(ip).catch(console.error);
    }

    return await this.provider.shadowBanIp(ip);
  }

  async unblockIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    this.blockedIps.delete(ip);
    broadcast({ type: "INFO", message: `Unblocking IP: ${ip}` });
    return await this.provider.unblockIp(ip);
  }

  async getBlockedIps(): Promise<string[]> {
    return Array.from(this.blockedIps);
  }

  async killProcess(pid: number) {
    broadcast({ type: "CRITICAL", message: `Quarantining process (PID: ${pid}). Performing forensic dump...` });
    
    // Forensic Preservation: Attempt to dump memory maps before killing
    try {
        if (this.provider.dumpProcessForensics) {
            await this.provider.dumpProcessForensics(pid);
        }
    } catch (e) {
        console.warn(`[FORENSICS] Failed to dump process ${pid}: ${(e as Error).message}`);
    }

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

  async flushRules() {
    broadcast({ type: "WARNING", message: "FLUSHING GLOBAL RULES" });
    this.blockedIps.clear();
    return await this.provider.flushRules();
  }
}
