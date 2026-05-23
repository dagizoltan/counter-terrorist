import { AutonomousResponseEngine } from "./autonomous_response.ts";
import { LogSeverity, LogType, MeshPort } from "@core/ports.ts";
import { PolicyEngine } from "./policy_engine.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { BaseService } from "@core/base_service.ts";
import { ThreatResponseSaga } from "./sagas/threat_response_saga.ts";
import { Result, ok } from "@core/result.ts";

export interface AutopilotDependencies {
  eventBus: any;
  logging: any;
  health: any;
  playbook: any;
  kernelService: any;
  processTracker: any;
  protection: any;
  audit: any;
  forensicService: any;
  mesh: MeshPort;
  notifications: any;
}

export class AutopilotService extends BaseService {
  private services?: AutopilotDependencies;
  private engine!: AutonomousResponseEngine;
  private policy: PolicyEngine;

  constructor() {
    super();
    this.policy = new PolicyEngine(loggingService);
  }

  public setServices(services: AutopilotDependencies) {
    this.services = services;
  }

    protected override onInit(..._args: any[]): Promise<Result<void>> {
    if (!this.services) return ok(undefined);

    const saga = new ThreatResponseSaga({
        firewall: this.services.protection.firewall,
        mesh: this.services.mesh,
        kernel: this.services.kernelService,
        pcap: this.services.protection.pcap,
        audit: this.services.audit,
        forensics: this.services.forensicService,
        logging: this.services.logging
    });

    this.engine = new AutonomousResponseEngine(
        saga,
        this.policy,
        this.services.logging
    );
    return ok(undefined);
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

    protected override onShutdown(): Promise<Result<void>> {
      if (!this.services) return ok(undefined);
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
      this.services.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:autopilot_service",
          message: "Autonomous Defense Mesh disengaged."
      });
      return ok(undefined);
  }

  async start() {
    if (!this.services) return;
    if (this.isStarted) return;
    this.isStarted = true;

    this.services.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:autopilot_service",
        message: "Autonomous Defense Mesh engaged."
    }); 
    
    await this.spawnLureProcess();

    // BUG-32 FIX: Robust health check using one-time promise and periodic reporting
    let lureExited = false;
    if (this.lureProcess) {
        this.lureProcess.status.then((status) => {
            lureExited = true;
            if (this.services?.health) {
                this.services.health.reportStatus("Lure", "FAILED", `Lure process exited with code ${status.code}`);
            }
        }).catch(() => {
            lureExited = true;
        });
    }

    const healthCheckInterval = setInterval(() => {
        if (!this.isStarted || !this.services) {
            clearInterval(healthCheckInterval);
            return;
        }

        if (this.lureProcess && !lureExited) {
            if (this.services.health) this.services.health.reportStatus("Lure", "OPERATIONAL");
        } else {
            if (this.services.health) this.services.health.reportStatus("Lure", "FAILED", "Lure process is not running or has exited");
        }
    }, 30000);
    this.unsubscribers.push(() => clearInterval(healthCheckInterval));

    // Keyed Listeners for domain-specific events
    const on = (ev: string, fn: (data: any) => void) => {
        this.unsubscribers.push(this.services!.eventBus.on(ev, fn));
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
        const anomalyResult = await this.services!.playbook.executeBehavioralAudit(pid, comm, syscall, args);
        
        if (anomalyResult === "BLOCK_SYSCALL") {
            await this.services!.kernelService.blockSyscall(pid, syscall);
        }

        await this.engine.evaluate({
            source: data.pid?.toString() || "kernel",
            type: `PRIVILEGE_ESCALATION_ATTEMPT`,
            severity: 9,
            description: `Critical syscall (${data.syscall}) from ${data.comm}`,
            data
        });

        // Demand Scan: Critical syscalls might indicate rootkit injection attempts
        try {
            const ghosts = await this.services!.processTracker.scanForGhosts();
            if (ghosts.length > 0) {
                await this.engine.evaluate({
                    source: "local",
                    type: "ROOTKIT_DETECTION",
                    severity: 10,
                    description: `Ghost processes identified after critical syscall: ${ghosts.join(", ")}`,
                    data: { ghosts }
                });
            }
        } catch (err) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:autopilot_service",
                message: `Ghost scan failed: ${err instanceof Error ? err.message : String(err)}`
            }).catch(() => {});
        }
    });

    // Proactive Artifact Containment Hook
    on("ARTIFACT_FOUND", async (data) => {
        await this.services!.playbook.executeArtifactContainment(data.indicator, data);
    });

    // Periodic integrity check using injected authoritative tracker
    const ghostInterval = setInterval(async () => {
        if (!this.isStarted || !this.services) {
            clearInterval(ghostInterval);
            return;
        }
        const ghosts = await this.services!.processTracker.scanForGhosts();
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
    this.unsubscribers.push(() => clearInterval(ghostInterval));
  }

    public spawnLureProcess() {
    if (!this.services) return;
    try {
        const scriptPath = new URL("../../tools/lure.ts", import.meta.url).pathname;
        const command = new Deno.Command(Deno.execPath(), {
            args: ["run", "-A", scriptPath],
            stdout: "null",
            stderr: "null",
        });
        this.lureProcess = command.spawn();
        this.services.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:autopilot_service:deception",
            message: "Deception lure deployed: hashicorp-vault-proxy"
        });
    } catch (e) {
        this.services.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:autopilot_service:deception",
            message: `Lure deployment failed: ${(e as Error).message}`
        });
    }
  }
}
