import { EventBus } from "@domain/index.ts";
import { PlaybookService } from "./playbook_service.ts";
import { broadcast } from "@api/ws.ts";
import { AuditService } from "../analysis/audit.ts";
import { AutonomousResponseEngine } from "./autonomous_response.ts";
import { ProtectionPort, LoggingPort } from "@core/ports.ts";
import { NotificationService } from "../analysis/notifications.ts";
import { MeshManager } from "./mesh.ts";

export class AutopilotService {
  private engine: AutonomousResponseEngine;

  constructor(
    private eventBus: EventBus,
    private playbookService: PlaybookService,
    private auditService: AuditService,
    private protection: ProtectionPort,
    private mesh: MeshManager,
    private notifications: NotificationService,
    private logging: LoggingPort
  ) {
    this.engine = new AutonomousResponseEngine(
        protection,
        mesh,
        notifications,
        auditService,
        logging
    );
  }

  /**
   * Exposes real-time threat intelligence from the response engine.
   */
  getTacticalIntelligence() {
    return this.engine.getTacticalIntelligence();
  }

  async start() {
    this.logging.log("[AUTOPILOT] Autonomous Defense Mesh engaged.", 6); 
    
    this.spawnLureProcess();

    this.eventBus.on("honeypot", async (event) => {
        if (event.type === "PortAccess") {
            await this.engine.evaluate({
                source: event.source_ip || event.ip,
                type: "HONEYPOT_TRIGGER",
                severity: 2,
                description: `Accessed honey-port ${event.port}`,
                data: event
            });
        }
    });

    this.eventBus.on("fim", async (event) => {
        if (event.type === "FileAlert") {
            await this.engine.evaluate({
                source: "local",
                type: "FILE_TAMPERING",
                severity: 5,
                description: `${event.action} on ${event.path}`,
                data: event
            });
        }
    });

    this.eventBus.on("ebpf", async (event) => {
        if (event.type === "SYSCALL_EVENT") {
            let severity = 1;
            if (event.syscall === "ptrace") severity = 4;
            if (event.syscall === "execve" && event.comm === "nc") severity = 3;
            
            await this.engine.evaluate({
                source: event.pid?.toString() || "kernel",
                type: `SUSPICIOUS_SYSCALL:${event.syscall}`,
                severity,
                description: `Process ${event.comm} called ${event.syscall}`,
                data: event
            });
        }
    });

    setInterval(async () => {
        const { ProcessTracker } = await import("../analysis/process_tracker.ts");
        const tracker = new ProcessTracker(this.logging);
        const ghosts = await tracker.scanForGhosts();
        
        if (ghosts.length > 0) {
            await this.engine.evaluate({
                source: "local",
                type: "ROOTKIT_DETECTION",
                severity: 10,
                description: `Ghost processes identified: ${ghosts.join(", ")}`,
                data: { ghosts }
            });
        }
    }, 300000); 
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
        this.logging.log("[AUTOPILOT] Deception lure deployed: hashicorp-vault-proxy", 6);
    } catch (e) {
        this.logging.log(`[AUTOPILOT] Lure deployment failed: ${(e as Error).message}`, 4);
    }
  }
}
