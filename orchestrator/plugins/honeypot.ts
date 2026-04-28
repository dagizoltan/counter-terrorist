import { Plugin } from "../services/plugin_manager.ts";
import { CommandManager } from "../infrastructure/command_manager.ts";
import { FirewallManager } from "../protection/firewall.ts";
import { PcapManager } from "../protection/pcap.ts";
import { BroadcastFunction } from "./types.ts";

export class HoneypotPlugin implements Plugin {
  constructor(
    private commandManager: CommandManager,
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction,
  ) {}
  name = "honeypot";
  private active = false;

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    if (this.active) return;

    console.log("[HONEYPOT] Starting Honeypot Sidecar...");

    try {
      const child = await this.commandManager.getPersistentSidecar("honeypot");
      if (!child) {
        console.error("[HONEYPOT] Failed to start sidecar: binary not found");
        return;
      }

      this.commandManager.onEvent("honeypot", (event) => {
        this.handleEvent(event);
      });

      this.active = true;
    } catch (error) {
      console.error("[HONEYPOT] Error starting sidecar:", error);
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
        console.warn(`[HONEYPOT] ALERT: Unauthorized port access on port ${payload.port} from ${payload.source_ip}`);
        this.broadcast({
          type: "CRITICAL",
          message: `Honeypot Triggered: Unauthorized access to port ${payload.port}`,
          data: { source_ip: payload.source_ip, port: payload.port }
        });

        // Auto-block logic
        this.firewall.blockIp(payload.source_ip).catch(err => {
          console.error(`[HONEYPOT] Failed to auto-block ${payload.source_ip}:`, err);
        });

        // Trigger PCAP capture (Phase 2 Requirement)
        this.pcap.startCapture("any", 30).catch(err => {
          console.error("[HONEYPOT] Failed to trigger PCAP:", err);
        });
        break;

      case "FileAccess":
        console.warn(`[HONEYPOT] ALERT: Unauthorized file access to ${payload.path} (${payload.event_type})`);
        this.broadcast({
          type: "CRITICAL",
          message: `Honeypot Triggered: Unauthorized file access to ${payload.path}`,
          data: { path: payload.path, event_type: payload.event_type }
        });
        break;

      case "Status":
        console.log(`[HONEYPOT] Status: ${payload.message}`);
        this.broadcast({
          type: "INFO",
          message: `Honeypot Status: ${payload.message}`
        });
        break;
    }
  }
}
