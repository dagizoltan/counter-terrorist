import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";
import { firewall } from "./firewall.ts";

export class HoneypotManager {
  private active = false;

  async start() {
    if (this.active) return;

    console.log("[HONEYPOT] Starting Honeypot Sidecar...");

    try {
      const child = await commandManager.getPersistentSidecar("honeypot");
      if (!child) {
        console.error("[HONEYPOT] Failed to start sidecar: binary not found");
        return;
      }

      commandManager.onEvent("honeypot", (event) => {
        this.handleEvent(event);
      });

      this.active = true;
    } catch (error) {
      console.error("[HONEYPOT] Error starting sidecar:", error);
    }
  }

  private handleEvent(event: any) {
    if (!event.event) return;

    const payload = event.event.payload;
    const type = event.event.type;

    switch (type) {
      case "PortAccess":
        console.warn(`[HONEYPOT] ALERT: Unauthorized port access on port ${payload.port} from ${payload.source_ip}`);
        broadcast({
          type: "CRITICAL",
          message: `Honeypot Triggered: Unauthorized access to port ${payload.port}`,
          data: { source_ip: payload.source_ip, port: payload.port }
        });

        // Auto-block logic
        firewall.blockIp(payload.source_ip).catch(err => {
          console.error(`[HONEYPOT] Failed to auto-block ${payload.source_ip}:`, err);
        });
        break;

      case "FileAccess":
        console.warn(`[HONEYPOT] ALERT: Unauthorized file access to ${payload.path} (${payload.event_type})`);
        broadcast({
          type: "CRITICAL",
          message: `Honeypot Triggered: Unauthorized file access to ${payload.path}`,
          data: { path: payload.path, event_type: payload.event_type }
        });
        break;

      case "Status":
        console.log(`[HONEYPOT] Status: ${payload.message}`);
        broadcast({
          type: "INFO",
          message: `Honeypot Status: ${payload.message}`
        });
        break;
    }
  }
}

export const honeypot = new HoneypotManager();
