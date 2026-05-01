import { EventBus } from "@domain/index.ts";
import { PlaybookService } from "./playbook_service.ts";
import { broadcast } from "@api/ws.ts";
import { AuditService } from "../analysis/audit.ts";

export class AutopilotService {
  constructor(
    private eventBus: EventBus,
    private playbookService: PlaybookService,
    private auditService: AuditService
  ) {}

  async start() {
    console.log("[AUTOPILOT] Self-Healing Engine engaged.");
    
    // Phase 6: Subterranean Deception - Spawn a Lure Process
    // This process looks like a sensitive vault proxy but is actually a sensor.
    this.spawnLureProcess();

    this.eventBus.on("honeypot", (event) => this.evaluate(event));
    this.eventBus.on("fim", (event) => this.evaluate(event));
    this.eventBus.on("ebpf", (event) => this.evaluate(event));

    // Periodic Subterranean Integrity Scan (Rootkit Detection)
    setInterval(async () => {
        const { ProcessTracker } = await import("../analysis/process_tracker.ts");
        const tracker = new ProcessTracker(this.auditService.getLogging());
        const ghosts = await tracker.scanForGhosts();
        
        if (ghosts.length > 0) {
            await this.auditService.logEvent({
                type: "THREAT",
                message: `ROOTKIT DETECTED: Ghost processes identified: ${ghosts.join(", ")}`,
                data: { ghosts }
            });
            await this.triggerSelfHeal(`ROOTKIT DETECTED: Ghost processes identified: ${ghosts.join(", ")}`, "local");
        }
    }, 300000); // Every 5 minutes
  }

  private threatDatabase: Map<string, { ports: Set<number>, events: any[] }> = new Map();

  private async evaluate(data: any) {
    if (!data) return;
    const sourceIp = data.source_ip || data.ip || data.remote_addr;
    if (!sourceIp) return;

    let entry = this.threatDatabase.get(sourceIp);
    if (!entry) {
        entry = { ports: new Set(), events: [] };
        this.threatDatabase.set(sourceIp, entry);
    }

    // 1. Port Scan Detection (Horizontal/Vertical)
    if (data.type === "PortAccess") {
        entry.ports.add(data.port);
        entry.events.push(data);

        if (entry.ports.size > 5) {
            await this.triggerSelfHeal(`PORT SCAN DETECTED: IP ${sourceIp} probed ${entry.ports.size} ports.`, sourceIp);
            entry.ports.clear(); // Reset after trigger
        }
    }

    // 2. High-Confidence Deception Trigger (Immediate Action)
    if (data.type === "PortAccess" && (data.port === 22 || data.port === 3389)) {
        await this.triggerSelfHeal(`CRITICAL SERVICE ACCESS: Unauthorized attempt on port ${data.port} by ${sourceIp}.`, sourceIp);
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
        await this.playbookService.runPlaybook("Emergency Isolation");
    }
  }

  private async spawnLureProcess() {
    try {
        const scriptPath = new URL("../../tools/lure.ts", import.meta.url).pathname;
        const command = new Deno.Command(Deno.execPath(), {
            args: ["run", "-A", scriptPath],
            stdout: "null",
            stderr: "null",
        });
        command.spawn();
        console.log("[AUTOPILOT] Subterranean Lure deployed: hashicorp-vault-proxy");
    } catch (e) {
        console.warn(`[AUTOPILOT] Failed to deploy lure: ${(e as Error).message}`);
    }
  }
}
