import { EventBus, ProcessTracker, ForensicService } from "@domain/index.ts";
import { PlaybookService } from "./playbook_service.ts";
import { broadcast } from "@api/ws.ts";
import { AuditService } from "../analysis/audit.ts";
import { AutonomousResponseEngine } from "./autonomous_response.ts";
import { ProtectionPort, LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { NotificationService } from "../analysis/notifications.ts";
import { MeshManager } from "./mesh.ts";

import { PolicyEngine } from "./policy_engine.ts";

export class AutopilotService {
  private engine: AutonomousResponseEngine;
  private policy: PolicyEngine;

  constructor(
    private eventBus: EventBus,
    private playbookService: PlaybookService,
    private auditService: AuditService,
    private protection: ProtectionPort,
    private mesh: MeshManager,
    private notifications: NotificationService,
    private logging: LoggingPort,
    private processTracker: ProcessTracker,
    private forensics: ForensicService,
    private kernel: any // KernelService
  ) {
    this.policy = new PolicyEngine(logging);
    this.engine = new AutonomousResponseEngine(
        this.policy,
        protection,
        kernel,
        mesh,
        notifications,
        auditService,
        forensics,
        logging
    );
  }

  getPolicy() {
    return this.policy;
  }

  /**
   * Exposes real-time threat intelligence from the response engine.
   */
  getTacticalIntelligence() {
    return this.engine.getTacticalIntelligence();
  }

  private isStarted = false;
  private lureProcess: Deno.ChildProcess | null = null;

  async start() {
    if (this.isStarted) return;
    this.isStarted = true;

    this.logging.log("[AUTOPILOT] Autonomous Defense Mesh engaged.", SyslogSeverity.NOTICE); 
    
    await this.spawnLureProcess();

    // Keyed Listeners for domain-specific events
    this.eventBus.on("HONEYPOT", async (data) => {
        await this.engine.evaluate({
            source: data.source_ip || data.ip || "unknown",
            type: "HONEYPOT_TRIGGER",
            severity: 2,
            description: `Accessed honey-port ${data.port}`,
            data
        });
    });

    this.eventBus.on("DRIFT_PROCESS", async (data) => {
        await this.engine.evaluate({
            source: "local",
            type: "FILE_TAMPERING",
            severity: 5,
            description: `Unauthorized change detected in ${data.resource}`,
            data
        });
    });

    this.eventBus.on("EBPF_STRAY_SHELL", async (data) => {
        await this.engine.evaluate({
            source: data.pid?.toString() || "kernel",
            type: `SUSPICIOUS_SHELL`,
            severity: 8,
            description: `Stray shell detected: ${data.comm} (PID: ${data.pid})`,
            data
        });
    });

    this.eventBus.on("EBPF_CRITICAL", async (data) => {
        await this.engine.evaluate({
            source: data.pid?.toString() || "kernel",
            type: `PRIVILEGE_ESCALATION_ATTEMPT`,
            severity: 9,
            description: `Critical syscall (${data.syscall}) from ${data.comm}`,
            data
        });

        // Demand Scan: Critical syscalls might indicate rootkit injection attempts
        this.processTracker.scanForGhosts().then(ghosts => {
            if (ghosts.length > 0) {
                this.engine.evaluate({
                    source: "local",
                    type: "ROOTKIT_DETECTION",
                    severity: 10,
                    description: `Ghost processes identified after critical syscall: ${ghosts.join(", ")}`,
                    data: { ghosts }
                });
            }
        });
    });

    // Periodic integrity check using injected authoritative tracker
    setInterval(async () => {
        const ghosts = await this.processTracker.scanForGhosts();
        if (ghosts.length > 0) {
            await this.engine.evaluate({
                source: "local",
                type: "ROOTKIT_DETECTION",
                severity: 10,
                description: `Ghost processes identified: ${ghosts.join(", ")}`,
                data: { ghosts }
            });
        }
    }, 60000); 
  }

  private async spawnLureProcess() {
    try {
        const scriptPath = new URL("../../tools/lure.ts", import.meta.url).pathname;
        const command = new Deno.Command(Deno.execPath(), {
            args: ["run", "-A", scriptPath],
            stdout: "null",
            stderr: "null",
        });
        this.lureProcess = command.spawn();
        this.logging.log("[AUTOPILOT] Deception lure deployed: hashicorp-vault-proxy", SyslogSeverity.NOTICE);
    } catch (e) {
        this.logging.log(`[AUTOPILOT] Lure deployment failed: ${(e as Error).message}`, SyslogSeverity.WARNING);
    }
  }
}
