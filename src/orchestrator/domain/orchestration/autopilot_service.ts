import { AutonomousResponseEngine } from "./autonomous_response.ts";
import {
    LogSeverity, LogType, MeshPort, EventBusPort,
    LoggingPort, NotificationPort, ProtectionPort
} from "@core/ports.ts";
import { PolicyEngine } from "./policy_engine.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { BaseService } from "@core/base_service.ts";
import { ThreatResponseSaga } from "./sagas/threat_response_saga.ts";
import { Result, ok } from "@core/result.ts";

export interface AutopilotDependencies {
  eventBus: EventBusPort;
  logging: LoggingPort;
  health: import("../analysis/health_service.ts").HealthService;
  playbook: import("./playbook_service.ts").PlaybookService;
  kernelService: import("../protection/kernel_service.ts").KernelService;
  processTracker: import("../analysis/process_tracker.ts").ProcessTracker;
  protection: ProtectionPort;
  audit: import("../analysis/audit.ts").AuditService;
  forensicService: import("../analysis/forensic_service.ts").ForensicService;
  mesh: MeshPort;
  notifications: NotificationPort;
}

export class AutopilotService extends BaseService {
  private services?: AutopilotDependencies;
  private engine!: AutonomousResponseEngine;
  private policy: PolicyEngine;

  constructor(config?: import("../../core/ports/system.ts").ConfigurationPort) {
    super();
    this.policy = new PolicyEngine(loggingService, config);
  }

  public setServices(services: AutopilotDependencies) {
    this.services = services;
  }

    protected override onInit(..._args: any[]): Promise<Result<void>> {
    if (!this.services) return Promise.resolve(ok(undefined));

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
    return Promise.resolve(ok(undefined));
  }

  getPolicy() {
    return this.policy;
  }

  /**
   * Exposes real-time threat intelligence from the response engine.
   *
   * The engine is only constructed in `onInit()` once `setServices()` has
   * supplied its dependencies. Until then (or if the autopilot was never
   * wired) there is no engine and hence no intelligence to report, so return
   * an empty set rather than dereferencing an undefined engine — this keeps
   * `/api/autopilot/intelligence` and the metrics rollup crash-free.
   */
  getTacticalIntelligence(): ReturnType<AutonomousResponseEngine["getTacticalIntelligence"]> {
    if (!this.engine) return [];
    return this.engine.getTacticalIntelligence();
  }

  private isStarted = false;
  private lureProcess: Deno.ChildProcess | null = null;
  private intervalId: number | null = null;
  private unsubscribers: (() => void)[] = [];

    protected override onShutdown(): Promise<Result<void>> {
      if (!this.services) return Promise.resolve(ok(undefined));
      this.isStarted = false;
      if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
      }
      this.unsubscribers.forEach(u => u());
      this.unsubscribers = [];
      if (this.lureProcess) {
          // Already exited, or we never had permission to signal it.
          try { this.lureProcess.kill(); } catch { /* process already gone */ }
          this.lureProcess = null;
      }
      this.services.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:autopilot_service",
          message: "Autonomous Defense Mesh disengaged."
      });
      return Promise.resolve(ok(undefined));
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
    const bus = this.services.eventBus;

    bus.on("HONEYPOT", async (data) => {
        await this.engine.evaluate({
            source: (data as Record<string, string>).source_ip || (data as Record<string, string>).ip || "unknown",
            type: "HONEYPOT_TRIGGER",
            severity: 2,
            description: `Accessed honey-port ${data.port}`,
            data
        }).catch(e => this.handleError(e, "HONEYPOT"));
    });

    bus.on("THREAT", async (data) => {
        await this.engine.evaluate({
            source: data.src_ip || data.nodeId || "local",
            type: "CANARY_TRIGGER",
            severity: 15,
            description: `Canary breadcrumb triggered: ${data.path}`,
            data
        }).catch(e => this.handleError(e, "THREAT"));
    });

    bus.on("DRIFT_PROCESS", async (data) => {
        await this.engine.evaluate({
            source: "local",
            type: "FILE_TAMPERING",
            severity: 2,
            description: `Unauthorized change detected in ${data.path}`,
            data
        }).catch(e => this.handleError(e, "DRIFT_PROCESS"));
    });

    bus.on("EBPF_STRAY_SHELL", async (data) => {
        await this.engine.evaluate({
            source: data.pid?.toString() || "kernel",
            type: `SUSPICIOUS_SHELL`,
            severity: 8,
            description: `Stray shell detected: ${data.comm} (PID: ${data.pid})`,
            data
        }).catch(e => this.handleError(e, "EBPF_STRAY_SHELL"));
    });

    bus.on("EBPF_CRITICAL", async (data) => {
        const { pid, comm, syscall, args } = data;
        
        const anomalyResult = await this.services!.playbook.executeBehavioralAudit(pid, comm, syscall, args || []);
        
        if (typeof anomalyResult === "object" && anomalyResult.success && anomalyResult.data === "BLOCK_SYSCALL") {
            await this.services!.kernelService.blockSyscall(pid, syscall);
        }

        await this.engine.evaluate({
            source: data.pid?.toString() || "kernel",
            type: `PRIVILEGE_ESCALATION_ATTEMPT`,
            severity: 9,
            description: `Critical syscall (${data.syscall}) from ${data.comm}`,
            data
        });

        try {
            const ghosts = await this.services!.processTracker.scanForGhosts();
            if (ghosts.length > 0) {
                await this.engine.evaluate({
                    source: "local",
                    type: "ROOTKIT_DETECTION",
                    severity: 10,
                    description: `Ghost processes identified after critical syscall: ${ghosts.join(", ")}`,
                    data: { ghosts }
                }).catch(e => this.handleError(e, "EBPF_CRITICAL_GHOST_EVAL"));
            }
        } catch (err) {
            this.services?.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:autopilot_service",
                message: `Ghost scan failed: ${err instanceof Error ? err.message : String(err)}`
            }).catch(() => {});
        }
    });

    bus.on("ARTIFACT_FOUND", async (data) => {
        await this.services!.playbook.executeArtifactContainment(data.indicator || "unknown", data).catch((e: Error) => this.handleError(e, "ARTIFACT_FOUND"));
    });

    // Periodic integrity check using injected authoritative tracker
    const ghostInterval = setInterval(async () => {
        if (!this.isStarted || !this.services) {
            clearInterval(ghostInterval);
            return;
        }
        try {
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
        } catch (e) {
            this.handleError(e as Error, "PERIODIC_GHOST_SCAN");
        }
    }, 60000);
    this.unsubscribers.push(() => clearInterval(ghostInterval));
  }

  private handleError(e: Error, context: string) {
      if (this.services?.logging) {
          this.services.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: `autopilot:${context}`,
              message: `Async task failed: ${e.message}`
          }).catch(() => {});
      }
      if (this.services?.health) {
          this.services.health.reportStatus("autopilot", "DEGRADED", `Task failed (${context}): ${e.message}`);
      }
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
