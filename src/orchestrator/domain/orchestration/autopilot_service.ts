import { EventBus, ProcessTracker, ForensicService } from "@domain/index.ts";
import { PlaybookService } from "./playbook_service.ts";
import { broadcast } from "@api/ws.ts";
import { AuditService } from "../analysis/audit.ts";
import { AutonomousResponseEngine } from "./autonomous_response.ts";
import { ProtectionPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
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
    private kernel: any, // KernelService
    private health?: any // HealthService
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
  private intervalId: number | null = null;
  private unsubscribers: (() => void)[] = [];

  shutdown() {
      this.isStarted = false;
      if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
      }
      this.unsubscribers.forEach(u => u());
      this.unsubscribers = [];
      if (this.lureProcess) {
          try { this.lureProcess.kill(); } catch {}
          this.lureProcess = null;
      }
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:autopilot_service",
          message: "Autonomous Defense Mesh disengaged."
      });
  }

  async start() {
    if (this.isStarted) return;
    this.isStarted = true;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:autopilot_service",
        message: "Autonomous Defense Mesh engaged."
    }); 
    
    await this.spawnLureProcess();

    // BUG-32: Periodic health check for the lure process
    const healthCheckInterval = setInterval(async () => {
        if (!this.isStarted) {
            clearInterval(healthCheckInterval);
            return;
        }

        if (this.lureProcess) {
            try {
                const status = await this.lureProcess.status;
                // If status resolved, the process exited
                if (this.health) this.health.reportStatus("Lure", "FAILED", `Lure process exited with code ${status.code}`);
                this.lureProcess = null;
            } catch {
                // Process is still running
                if (this.health) this.health.reportStatus("Lure", "OPERATIONAL");
            }
        } else {
            if (this.health) this.health.reportStatus("Lure", "FAILED", "Lure process is not running");
        }
    }, 30000);
    this.unsubscribers.push(() => clearInterval(healthCheckInterval));

    // Keyed Listeners for domain-specific events
    const on = (ev: string, fn: (data: any) => void) => {
        this.unsubscribers.push(this.eventBus.on(ev, fn));
    };

    on("HONEYPOT", async (data) => {
        await this.engine.evaluate({
            source: data.source_ip || data.ip || "unknown",
            type: "HONEYPOT_TRIGGER",
            severity: 2,
            description: `Accessed honey-port ${data.port}`,
            data
        });
    });

    on("THREAT", async (data) => {
        await this.engine.evaluate({
            source: data.source_ip || data.ip || "local",
            type: "CANARY_TRIGGER",
            severity: 15,
            description: `Canary breadcrumb triggered: ${data.path}`,
            data
        });
    });

    on("DRIFT_PROCESS", async (data) => {
        await this.engine.evaluate({
            source: "local",
            type: "FILE_TAMPERING",
            severity: 2,
            description: `Unauthorized change detected in ${data.path || data.resource}`,
            data
        });
    });

    on("EBPF_STRAY_SHELL", async (data) => {
        await this.engine.evaluate({
            source: data.pid?.toString() || "kernel",
            type: `SUSPICIOUS_SHELL`,
            severity: 8,
            description: `Stray shell detected: ${data.comm} (PID: ${data.pid})`,
            data
        });
    });

    on("EBPF_CRITICAL", async (data) => {
        const { pid, comm, syscall, args } = data;
        
        // 1. Behavioral Assessment
        const anomalyResult = await this.playbookService.executeBehavioralAudit(pid, comm, syscall, args);
        
        if (anomalyResult === "BLOCK_SYSCALL") {
            await this.kernel.blockSyscall(pid, syscall);
        }

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

    // Proactive Artifact Containment Hook
    on("ARTIFACT_FOUND", async (data) => {
        await this.playbookService.executeArtifactContainment(data.indicator, data);
    });

    // Periodic integrity check using injected authoritative tracker
    this.intervalId = setInterval(async () => {
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
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:autopilot_service:deception",
            message: "Deception lure deployed: hashicorp-vault-proxy"
        });
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:autopilot_service:deception",
            message: `Lure deployment failed: ${(e as Error).message}`
        });
    }
  }
}
