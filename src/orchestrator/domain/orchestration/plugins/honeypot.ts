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
      const child = await this.sidecarManager.getPersistentSidecar("honeypot");
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

      this.sidecarManager.onEvent("honeypot", (event) => {
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

  async stop() {
    // Currently CommandManager doesn't support explicit sidecar termination via API
    // but we can mark it inactive.
    this.active = false;
  }

  private handleEvent(event: any) {
    if (!event.event) return;

    const payload = event.event.payload;
    const type = event.event.type;

    switch (type) {
      case "PortAccess":
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "HONEYPOT",
            message: `ALERT: Unauthorized port access on port ${payload.port} from ${payload.source_ip}`
        });
        this.broadcast({
          type: "AUDIT_EVENT",
          data: {
              type: LogType.AUDIT,
              severity: LogSeverity.CRITICAL,
              caller: "decoy:system",
              message: `Honeypot Triggered: Unauthorized access to port ${payload.port}`,
              data: { source_ip: payload.source_ip, port: payload.port }
          }
        });

        // Auto-block logic
        this.firewall.blockIp(payload.source_ip).catch(err => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "HONEYPOT",
              message: `Failed to auto-block ${payload.source_ip}: ${err.message}`
          });
        });

        // Trigger PCAP capture (Phase 2 Requirement)
        this.pcap.startCapture("any", 30).catch(err => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "HONEYPOT",
              message: `Failed to trigger PCAP: ${err.message}`
          });
        });
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
              severity: LogSeverity.CRITICAL,
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
}
