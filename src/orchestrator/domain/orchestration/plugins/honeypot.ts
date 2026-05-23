import { Plugin } from "../plugin_manager.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { BroadcastFunction } from "./types.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export class HoneypotPlugin implements Plugin {
  constructor(
    private sidecarManager: SidecarManager,
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction,
  ) {}
  name = "honeypot";
  description = "Orchestrates multi-vector deception nodes and decoys across the mesh.";
  private active = false;

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    if (this.active) return;

    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "HONEYPOT",
        message: "Starting Honeypot Sidecar..."
    });

    try {
      const child = await this.sidecarManager.getPersistentSidecar("decoy");
      if (!child) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "HONEYPOT",
            message: "Failed to start sidecar: binary not found"
        });
        return;
      }

      this.sidecarManager.onEvent("decoy", (event) => {
        this.handleEvent(event);
      });

      this.active = true;
    } catch (error) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "HONEYPOT",
          message: `Error starting sidecar: ${(error as Error).message}`
      });
      throw error;
    }
  }

  stop() {
    // Currently CommandManager doesn't support explicit sidecar termination via API
    // but we can mark it inactive.
    this.active = false;
  }

  private handleEvent(event: unknown) {
    if (!event || typeof event !== "object") return;
    const ev = (event as { event?: { type?: string; payload?: unknown } }).event;
    if (!ev || typeof ev.type !== "string") return;

    const payload = ev.payload as Record<string, unknown> | undefined;
    const type = ev.type as string;

    switch (type) {
      case "PortAccess":
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "HONEYPOT",
            message: `ALERT: Unauthorized port access on port ${payload.port} from ${payload.source_ip}. Engaging Tarpit...`
        });
        
        // 1. Engage Tarpit immediately to waste their time
        (async () => {
          try {
            await this.tarpitIp(String(payload?.source_ip));
          } catch (err) {
            loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.WARNING,
              caller: "HONEYPOT",
              message: `Tarpit engagement failed for ${String(payload?.source_ip)}: ${err instanceof Error ? err.message : String(err)}`
            });
          }
        })();

        this.broadcast({
          type: "AUDIT_EVENT",
          data: {
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "decoy:system",
              message: `Honeypot Triggered: Unauthorized access to port ${payload.port}. Tarpitting active.`,
              data: { source_ip: payload.source_ip, port: payload.port }
          }
        });

        // 2. Trigger PCAP capture for forensics
        (async () => {
          try {
            await this.pcap.startCapture("any", 60);
          } catch (err) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "HONEYPOT",
                message: `Failed to trigger PCAP: ${err instanceof Error ? err.message : String(err)}`
            });
          }
        })();

        // 3. Delayed Block: Wait 30s while tarpitting before committing to firewall
        setTimeout(() => {
            this.firewall.blockIp(payload.source_ip).catch(err => {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "HONEYPOT",
                    message: `Failed to auto-block ${payload.source_ip} after tarpit: ${err.message}`
                });
            });
        }, 30000);
        break;

      case "FileAccess":
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "HONEYPOT",
            message: `ALERT: Unauthorized file access to ${payload.path} (${payload.event_type})`
        });
        this.broadcast({
          type: "AUDIT_EVENT",
          data: {
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "decoy:system",
              message: `Honeypot Triggered: Unauthorized file access to ${payload.path}`,
              data: { path: payload.path, event_type: payload.event_type }
          }
        });
        break;

      case "Status":
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "HONEYPOT",
            message: `Status: ${payload.message}`
        });
        this.broadcast({
          type: "AUDIT_EVENT",
          data: {
              type: LogType.ACTIVITY,
              severity: LogSeverity.INFO,
              caller: "decoy:system",
              message: `Honeypot Status: ${payload.message}`
          }
        });
        break;
    }
  }

  /**
   * Flag an IP for Tarpitting.
   * This slows down all subsequent interactions from this IP in the deception grid.
   */
  async tarpitIp(ip: string) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "HONEYPOT",
        message: `Engaging Tarpit for IP: ${ip}. Wasting attacker resources...`
    });
    
    try {
        await this.sidecarManager.sendCommand("decoy", {
            type: "Sabotage",
            source_ip: ip,
            level: "MAXIMUM"
        });
    } catch (error) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "HONEYPOT",
            message: `Failed to engage tarpit for ${ip}: ${(error as Error).message}`
        });
    }
  }
}
