import { SidecarManager } from "../infrastructure/sidecar_manager.ts";
import { ProtectionPort } from "../core/ports.ts";
import { NotificationService } from "./alerts.ts";
import { loggingService, SyslogSeverity } from "../infrastructure/logging.ts";

export class PlaybookService {
  constructor(
    private sidecarManager: SidecarManager,
    private protection: ProtectionPort,
    private notifications: NotificationService
  ) {}

  public async init() {
    loggingService.log("[PLAYBOOK] Initializing Automated Response Engine", SyslogSeverity.INFORMATIONAL);

    // Honeypot Playbook: Auto-block any IP that connects to honey ports
    this.sidecarManager.onEvent("honeypot", async (data) => {
      if (data.event?.type === "PortAccess") {
        const { port, source_ip } = data.event.payload;
        loggingService.log(`[PLAYBOOK] Honeypot trigger on port ${port} from ${source_ip}. Executing auto-block.`, SyslogSeverity.WARNING);
        
        try {
          await this.protection.firewall.blockIp(source_ip);
          await this.notifications.notify({
            type: "HIGH",
            message: `IP ${source_ip} automatically blocked after honeypot access on port ${port}`
          });
        } catch (err: any) {
          loggingService.log(`[PLAYBOOK] Failed to block IP ${source_ip}: ${err.message}`, SyslogSeverity.ERROR);
        }
      }
    });

    // FIM Playbook: High-priority notification on critical file change
    this.sidecarManager.onEvent("fim", async (data) => {
      if (data.event?.type === "FileAlert") {
        const { path, action } = data.event.payload;
        loggingService.log(`[PLAYBOOK] FIM trigger: ${action} detected on ${path}`, SyslogSeverity.CRITICAL);
        
        await this.notifications.notify({
          type: "CRITICAL",
          message: `Unauthorized ${action} detected on ${path}. Investigation required immediately.`
        });
      }
    });
  }
}
