import { EventBus } from "../index.ts";
import { PlaybookService } from "./playbook_service.ts";
import { broadcast } from "../api/ws.ts";
import { AuditService } from "./audit.ts";

export class AutopilotService {
  constructor(
    private eventBus: EventBus,
    private playbookService: PlaybookService,
    private auditService: AuditService
  ) {}

  start() {
    console.log("[AUTOPILOT] Self-Healing Engine engaged.");
    
    // Pattern 1: Multi-Vector Compromise (Shell + Canary)
    this.eventBus.on("honeypot", (data) => this.evaluate(data));
    
    // We can also listen to direct event names if EventBus supports them
    // For now, let's just use a general subscriber if available or specific ones
  }

  private async evaluate(event: any) {
    // Logic to detect complex attack patterns
    if (event.type === "PortAccess" && event.port === 22) {
       // Potential brute force - Autopilot can trigger proactive throttling
    }
  }

  /**
   * Triggers a self-healing playbook based on a high-confidence threat.
   */
  async triggerSelfHeal(reason: string, targetIp?: string) {
    this.auditService.logEvent({
        type: "CRITICAL",
        message: `AUTOPILOT: Critical threat detected (${reason}). Engaging Self-Healing Playbook.`,
        data: { targetIp }
    });

    broadcast({ 
        type: "CRITICAL", 
        message: `AUTOPILOT: Self-Healing Active // ${reason}`,
        data: { autopilot: true }
    });

    if (targetIp) {
        // Find a relevant playbook or execute hard-coded safety steps
        await this.playbookService.runPlaybook("Emergency Isolation");
    }
  }
}
