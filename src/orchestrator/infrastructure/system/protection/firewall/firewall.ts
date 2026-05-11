import { broadcast } from "@api/ws.ts";
import { meshManager } from "@domain/orchestration/mesh.ts";
import { isValidIP } from "../../validation.ts";
import { FirewallProvider } from "../interfaces.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export type { FirewallProvider };

export class FirewallManager {
  private blockedIps: Set<string> = new Set();
  private kv?: Deno.Kv;

  constructor(private provider: FirewallProvider, private networkLogs?: any) {}

  async setKv(kv: Deno.Kv) {
    this.kv = kv;
    const iter = kv.list<any>({ prefix: ["enforcement"] });
    for await (const res of iter) {
      const ip = res.key[1] as string;
      this.blockedIps.add(ip);
      // Immediately enforce in the kernel agent during boot
      await this.provider.blockIp(ip).catch(() => {});
    }
  }

  async blockIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    this.blockedIps.add(ip);
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.AUDIT, 
            severity: LogSeverity.WARNING, 
            caller: "orchestrator:infra:system:protection:firewall",
            message: `Perimeter Block: Malicious IP ${ip} successfully committed to blocklist`,
            payload: { ip } 
        } 
    });

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
      meshManager.broadcastBlock(ip).catch(err => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.WARNING,
              caller: "orchestrator:infra:system:protection:firewall:mgmt",
              message: `Failed to broadcast block for ${ip}: ${err.message}`
          });
      });
    }

    if (this.kv) {
        await this.kv.set(["enforcement", ip], { 
            reason: "MANUAL_BLOCK", 
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), 
            committedAt: Date.now() 
        });
    }

    return await this.provider.blockIp(ip);
  }

  async shadowBanIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.AUDIT, 
            severity: LogSeverity.WARNING, 
            caller: "orchestrator:infra:system:protection:firewall",
            message: `Shadow Banning IP: ${ip} (Throttling to 1KB/s)`, 
            payload: { ip } 
        } 
    });
    
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
      meshManager.broadcastBlock(ip).catch(err => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.WARNING,
              caller: "orchestrator:infra:system:protection:firewall:mgmt",
              message: `Failed to broadcast shadow ban for ${ip}: ${err.message}`
          });
      });
    }

    return await this.provider.shadowBanIp(ip);
  }

  async unblockIp(ip: string) {
    if (!isValidIP(ip)) {
      return { success: false, stdout: "", stderr: `Invalid IP address: ${ip}` };
    }
    this.blockedIps.delete(ip);
    if (this.kv) {
        await this.kv.delete(["enforcement", ip]);
    }
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.ACTIVITY, 
            severity: LogSeverity.INFO, 
            caller: "orchestrator:infra:system:protection:firewall",
            message: `Unblocking IP: ${ip}`,
            payload: { ip }
        } 
    });
    return await this.provider.unblockIp(ip);
  }

  async isolate(ip: string, _reason: string) {
    return await this.blockIp(ip);
  }

  async unblock(ip: string) {
    return await this.unblockIp(ip);
  }

  async isBlocked(ip: string): Promise<boolean> {
    return this.blockedIps.has(ip);
  }

  async getBlockedIps(): Promise<string[]> {
    return Array.from(this.blockedIps);
  }

  async killProcess(pid: number) {
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.AUDIT, 
            severity: LogSeverity.ERROR, 
            caller: "orchestrator:infra:system:protection:forensics:enforcement",
            message: `Terminating process (PID: ${pid}). Performing forensic dump...`,
            payload: { pid }
        } 
    });
    
    // Forensic Preservation: Attempt to dump memory maps before killing
    try {
        if (this.provider.dumpProcessForensics) {
            await this.provider.dumpProcessForensics(pid);
        }
    } catch (e) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:infra:system:protection:forensics",
            message: `Failed to dump process ${pid}: ${(e as Error).message}`
        });
    }

    return await this.provider.killProcess(pid);
  }

  async quarantineProcess(pid: number) {
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.AUDIT, 
            severity: LogSeverity.WARNING, 
            caller: "orchestrator:infra:system:protection:forensics:enforcement",
            message: `Quarantining process (PID: ${pid}). Suspending execution...`,
            payload: { pid }
        } 
    });
    return await this.provider.quarantineProcess(pid);
  }

  async getStatus() {
    return await this.provider.getStatus();
  }

  async lockdown() {
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.AUDIT, 
            severity: LogSeverity.ERROR, 
            caller: "orchestrator:infra:system:protection:firewall",
            message: "LOCKDOWN PROTOCOL INITIATED (Fail-Closed Mode Engaged)" 
        } 
    });
    
    if (meshManager) {
      meshManager.broadcastLockdown().catch(err => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.WARNING,
              caller: "orchestrator:infra:system:protection:firewall:mgmt",
              message: `Failed to broadcast lockdown: ${err.message}`
          });
      });
    }

    return await this.provider.lockdown();
  }

  async allowPort(port: number, protocol: "tcp" | "udp" = "tcp") {
    return await this.provider.allowPort(port, protocol);
  }

  async denyPort(port: number, protocol: "tcp" | "udp" = "tcp") {
    return await this.provider.denyPort(port, protocol);
  }

  async flushRules() {
    broadcast({ 
        type: "AUDIT_EVENT", 
        data: { 
            type: LogType.ACTIVITY, 
            severity: LogSeverity.WARNING, 
            caller: "orchestrator:infra:system:protection:firewall:mgmt",
            message: "FLUSHING GLOBAL RULES" 
        } 
    });
    this.blockedIps.clear();
    return await this.provider.flushRules();
  }
}
