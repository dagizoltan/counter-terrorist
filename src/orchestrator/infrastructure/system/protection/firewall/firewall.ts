import { broadcast } from "@interface/ws_handler.ts";
import { meshManager } from "@domain/orchestration/mesh.ts";
import { isValidIP } from "../../validation.ts";
import { FirewallProvider } from "../interfaces.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType, FirewallPort, ConfigurationPort, EventBusPort, LoggingPort } from "@core/ports.ts";

export type { FirewallProvider };

export class FirewallManager implements FirewallPort {
  private blockedIps: Set<string> = new Set();
  private kv?: Deno.Kv;
  private connectivityCheckInProgress = false;
  private config?: ConfigurationPort;

  private eventBus?: EventBusPort;
  private metricsInterval?: number;

  constructor(private provider: FirewallProvider, private networkLogs?: LoggingPort) {
      this.metricsInterval = setInterval(() => this.emitMetrics(), 15000);
  }

  shutdown() {
      if (this.metricsInterval) {
          clearInterval(this.metricsInterval);
          this.metricsInterval = undefined;
      }
  }

  setEventBus(eventBus: EventBusPort) {
      this.eventBus = eventBus;
  }

  setConfig(config: ConfigurationPort) {
      this.config = config;
  }

  private async emitMetrics() {
      if (!this.eventBus) return;

      const status = await this.getStatus();
      const blockedIps = await this.getBlockedIps();
      const rules = status.stdout?.split('\n').filter((l: string) => l.trim()) || [];
      const rejectCount = (status.stdout?.match(/REJECT|DROP|DENY/g) || []).length;

      await this.eventBus.emit("METRIC_UPDATE", {
          domain: "firewall",
          data: {
              blockedCount: rejectCount,
              rules: rules.length,
              blockedIps: blockedIps.slice(0, 20),
              // Note: behavioral metrics should be emitted by BehavioralService
          }
      });
  }

  async setKv(kv: Deno.Kv) {
    this.kv = kv;
    // Audit 9.2: Implementing True Paginated Hydration to prevent boot-time DoS.
    // Iterating over the full KV prefix 'enforcement' via the async iterator.
    const iter = kv.list<unknown>({ prefix: ["enforcement"] });
    const ips: string[] = [];
    for await (const res of iter) {
      const ip = res.key[1] as string;

      // H-01: Explicitly validate IP from KV during hydration to prevent poisoned state
      if (isValidIP(ip)) {
        this.blockedIps.add(ip);
        ips.push(ip);
      } else {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:infra:system:protection:firewall",
              message: `CRITICAL: Invalid enforcement record found in KV: '${ip}'. Dropping to maintain integrity.`
          });
      }
    }

    if (ips.length > 0) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:infra:system:protection:firewall",
          message: `Hydrating firewall with ${ips.length} existing enforcement rules...`
      });

      // Parallel enforcement with concurrency limit to avoid OS overhead
      const limit = 50;
      for (let i = 0; i < ips.length; i += limit) {
        const batch = ips.slice(i, i + limit);
        await Promise.all(batch.map(ip => this.provider.blockIp(ip).catch(e => loggingService.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "firewall", message: `Batch block failed for ${ip}: ${e.message}` }).catch(() => {}))));
      }

      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.SUCCESS,
          caller: "orchestrator:infra:system:protection:firewall",
          message: `Firewall hydration complete.`
      });
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

    // The perimeter ledger, via the method that means it. This used to call
    // log() with direction/source/destination nested under `payload`, which
    // the service's shape check never matched — so no block ever reached the
    // traffic record.
    await this.networkLogs?.logNetwork?.({
        timestamp: new Date().toISOString(),
        direction: "INBOUND",
        source: ip,
        destination: "LOCAL",
        protocol: "ANY",
        length: 0,
        action: "BLOCK"
    });

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

    const res = await this.provider.blockIp(ip);
    if (res.success) {
        this.verifyConnectivity().catch(e => loggingService.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "firewall", message: `Connectivity check task failed: ${e.message}` }).catch(() => {}));
    }
    return res;
  }

  private async verifyConnectivity() {
      if (this.connectivityCheckInProgress) return;
      this.connectivityCheckInProgress = true;

      const checkInIp = this.config?.getEnv("PILOT_CHECKIN_IP") || "8.8.8.8";
      const isPilot = this.config?.getBoolean("PILOT_MODE", false);

      if (!isPilot) {
          this.connectivityCheckInProgress = false;
          return;
      }

      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.ACTIVITY,
          severity: LogSeverity.INFO,
          caller: "firewall:connectivity_guard",
          message: `Connectivity Guard: Verifying system access via ${checkInIp}...`
      });

      // Allow some time for rule to settle and connectivity to be tested
      await new Promise(r => setTimeout(r, 5000));

      try {
          const command = new Deno.Command("ping", {
              args: ["-c", "1", "-W", "2", checkInIp],
              stdout: "null",
              stderr: "null"
          });
          const { success } = await command.output();

          if (!success) {
              loggingService.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.ERROR,
                  caller: "firewall:connectivity_guard",
                  message: "🚨 CONNECTIVITY LOST after firewall change! Initiating automatic rollback..."
              });

              await this.flushRules();

              // Trigger Mesh Re-discovery to ensure node identity is re-verified after connectivity restore
              if (meshManager) {
                  meshManager.resyncNodes?.().catch(e => loggingService.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "firewall", message: `Mesh resync failed: ${e.message}` }).catch(() => {}));
              }

              loggingService.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.SUCCESS,
                  caller: "firewall:connectivity_guard",
                  message: "✅ Rollback complete. Management access restored."
              });
          } else {
              loggingService.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.ACTIVITY,
                  severity: LogSeverity.SUCCESS,
                  caller: "firewall:connectivity_guard",
                  message: "Connectivity verified. Changes committed."
              });
          }
      } catch (e) {
          console.error(`Connectivity guard error: ${e}`);
      } finally {
          this.connectivityCheckInProgress = false;
      }
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
    
    await this.networkLogs?.logNetwork?.({
        timestamp: new Date().toISOString(),
        direction: "INBOUND",
        source: ip,
        destination: "LOCAL",
        protocol: "ANY",
        length: 0,
        action: "SHADOW"
    });

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

    const res = await this.provider.shadowBanIp(ip);
    if (res.success) {
        this.verifyConnectivity().catch(e => loggingService.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "firewall", message: `Connectivity check task failed: ${e.message}` }).catch(() => {}));
    }
    return res;
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

  isBlocked(ip: string): Promise<boolean> {
    return Promise.resolve(this.blockedIps.has(ip));
  }

  getBlockedIps(): Promise<string[]> {
    return Promise.resolve(Array.from(this.blockedIps));
  }

  /**
   * The enforcement ledger: every active block with the record behind it.
   *
   * blockIp() and CuratedIntelService.commitIsolation() both write
   * ["enforcement", ip] -> { reason, expiresAt, committedAt }, and the
   * lifecycle audit re-verifies each entry as its TTL lapses, either extending
   * it 24h or purging it. Nothing read any of that back: getBlockedIps()
   * returns bare strings, and the metrics snapshot caps its copy at 20 — so
   * the console could show an IP was blocked but never why, since when, or
   * how long it has left.
   *
   * An in-memory block with no KV record is still reported, with a null
   * record: it is enforced either way, and hiding it would under-report what
   * the perimeter is actually doing.
   */
  async getEnforcementLedger(): Promise<Array<{
    ip: string;
    reason: string | null;
    committedAt: number | null;
    expiresAt: number | null;
    persisted: boolean;
  }>> {
    const records = new Map<string, { reason?: string; expiresAt?: number; committedAt?: number }>();

    if (this.kv) {
      const iter = this.kv.list<{ reason?: string; expiresAt?: number; committedAt?: number }>({
        prefix: ["enforcement"],
      });
      for await (const res of iter) {
        const ip = String(res.key[1]);
        // Same guard as hydration: a poisoned KV key must not reach the UI.
        if (isValidIP(ip)) records.set(ip, res.value ?? {});
      }
    }

    // Union of what is enforced in memory and what is on record, so neither a
    // block that predates KV nor a record whose process restarted goes missing.
    const ips = new Set<string>([...this.blockedIps, ...records.keys()]);

    return [...ips].map((ip) => {
      const record = records.get(ip);
      return {
        ip,
        reason: record?.reason ?? null,
        committedAt: record?.committedAt ?? null,
        expiresAt: record?.expiresAt ?? null,
        persisted: record !== undefined,
      };
    }).sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0));
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

  async enforcePid(pid: number) {
    broadcast({
        type: "AUDIT_EVENT",
        data: {
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:infra:system:protection:firewall:enforcement",
            message: `Active LSM Enforcement: Restricted all resource access for PID ${pid}`,
            payload: { pid }
        }
    });
    return await this.provider.enforcePid(pid);
  }

  async unenforcePid(pid: number) {
    return await this.provider.unenforcePid(pid);
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

  /**
   * What the host is listening on.
   *
   * The console could open and close ports — arming a decoy does exactly that
   * — but never had a way to report which ports were open, so the result of
   * the control was invisible and an unintended listener could not be spotted.
   */
  async listListeningPorts() {
    if (!this.provider.listListeningPorts) return [];
    return await this.provider.listListeningPorts();
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

  async sendCommand(name: string, cmd: string | Record<string, unknown>) {
    if (this.provider.sendCommand) {
        return await this.provider.sendCommand(name, cmd);
    }
    return { success: false, stdout: "", stderr: "Firewall provider does not support direct commands" };
  }
}
