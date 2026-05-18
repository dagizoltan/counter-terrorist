import { LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { BaseService } from "@core/base_service.ts";

export interface PlaybookDependencies {
  eventBus: any;
  protection: any;
  notifications: any;
  mesh: any;
  shadowProtocol: any;
  behavioral?: any;
}

export class PlaybookService extends BaseService {
  private services?: PlaybookDependencies;
  private threatScores: Map<string, number> = new Map();
  private readonly ISOLATION_THRESHOLD = 5;

  constructor() {
    super();
  }

  public setServices(services: PlaybookDependencies) {
    this.services = services;
  }

  public override async init(..._args: any[]): Promise<import("@core/result.ts").Result<void>> {
    const { ok } = await import("@core/result.ts");
    if (!this.services) return ok(undefined);

    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:playbook_service",
        message: "Initializing Automated Response Engine"
    });

    const eventBus = this.services.eventBus;

    // Honeypot Playbook: Auto-block any IP that connects to honey ports
    eventBus.on("HONEYPOT", async (data: any) => {
      if (data && data.type === "PortAccess") {
        const { port, source_ip } = data;
        
        const { isValidIP, isCriticalInfrastructure } = await import("@infrastructure/system/validation.ts");
        if (!isValidIP(source_ip) || isCriticalInfrastructure(source_ip)) {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.INFO,
              caller: "orchestrator:domain:orchestration:playbook_service",
              message: `Honeypot trigger from ${source_ip} (WHITELISTED/INVALID). Skipping block.`
          });
          return;
        }

        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `Honeypot trigger on port ${port} from ${source_ip}. Executing auto-block.`
        });
        
        this.updateThreatScore("local", 1);
        
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `Starting forensic capture for IP: ${source_ip}`
        });
        this.services?.protection.pcap.startCapture("any", 60, `threat_${source_ip}_${Date.now()}.pcap`, `host ${source_ip}`).catch(() => {});

        try {
          await this.services?.protection.firewall.blockIp(source_ip);
          await this.services?.notifications.notify({
            type: "audit",
            message: `IP ${source_ip} automatically blocked after honeypot access on port ${port}`
          });
        } catch (err: any) {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:orchestration:playbook_service",
              message: `Failed to block IP ${source_ip}: ${(err as Error).message}`
          });
        }
      }
    });

    // FIM Playbook: High-priority notification on critical file change
    eventBus.on("DRIFT_PROCESS", async (data: any) => {
      const { path, action } = data;
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:orchestration:playbook_service",
          message: `FIM trigger: ${action} detected on ${path}`
      });
      
      await this.services?.notifications.notify({
        type: "audit",
        message: `Unauthorized ${action} detected on ${path}. Investigation required immediately.`
      });

      this.updateThreatScore("local", 2);
    });

    // eBPF Playbook: Monitor suspicious syscalls and quarantine
    eventBus.on("EBPF_CRITICAL", async (data: any) => {
      const { pid, comm, syscall } = data;
      
      if (syscall === "ptrace") {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `SUSPICIOUS PTRACE detected from ${comm} (PID: ${pid}). Executing Quarantine.`
        });
        
        try {
          await this.services?.protection.firewall.killProcess(pid);
          await this.services?.shadowProtocol.activate(); // ENGAGE SHADOW MODE
          await this.services?.notifications.notify({
            type: "audit",
            message: `Process ${comm} (PID: ${pid}) quarantined due to ptrace violation. SHADOW PROTOCOL ENGAGED.`
          });
        } catch (err: any) {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:orchestration:playbook_service",
              message: `Failed to quarantine process ${pid}: ${(err as Error).message}`
          });
        }
        
        this.updateThreatScore("local", 3);
      }
    });

    // Mesh Playbook: Monitor node threat levels
    eventBus.on("THREAT", async (data: any) => {
      const { nodeId, severity, path } = data;
      if (severity === "HIGH" || severity === "CRITICAL" || path) {
         this.updateThreatScore(nodeId || "local", 1);
      }
    });

    // Artifact Playbook: Proactive Quarantine & Containment
    eventBus.on("ARTIFACT_FOUND", async (data: any) => {
       await this.executeArtifactContainment(data.indicator, data);
    });

    // Cross-Platform Playbook Hooks
    eventBus.on("ES_EXEC", async (data: any) => {
        const { path, pid, signing_id } = data;
        if (path.includes("curl") || path.includes("wget")) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "PLAYBOOK:ESF",
                message: `macOS Policy Violation: Unauthorized binary execution detected: ${path} (ID: ${signing_id})`
            });
            this.updateThreatScore("local", 1);
        }
    });

    eventBus.on("ETW_PROCESS", async (data: any) => {
        const { process_name, command_line } = data;
        if (command_line.includes("powershell -enc")) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "PLAYBOOK:ETW",
                message: `Windows Policy Violation: Encoded PowerShell detected: ${process_name}`
            });
            this.updateThreatScore("local", 2);
        }
    });
    return ok(undefined);
  }

  /**
   * Executes the 'Artifact Containment' playbook.
   * Multi-stage response to binary threats.
   */
  public async executeArtifactContainment(artifact: string, metadata: any) {
      if (!this.services) return;

      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "PLAYBOOK:ARTIFACT",
          message: `[PLAYBOOK] Engaging 'Artifact Containment' for ${artifact.slice(0, 8)}...`
      });

      // 1. Proactive Quarantine (If path is known or globally applicable)
      // In a real environment, the agent would search and move.
      if (metadata.path) {
          await this.services.protection.antivirus.quarantine(metadata.path);
      }

      // 2. Mesh Isolation (OpSec baseline)
      await this.services.mesh.isolateNode("local");

      // 3. Trigger Forensic Acquisition
      this.services.protection.pcap.startCapture("any", 120, `artifact_containment_${artifact.slice(0, 8)}.pcap`).catch(() => {});

      await this.services.notifications.notify({
          type: "audit",
          message: `AUTOPILOT: Artifact Containment engaged for ${artifact.slice(0, 8)}. Host isolated. Forensic capture active.`
      });
  }

  /**
   * Executes a behavioral audit on a specific syscall event.
   */
  public async executeBehavioralAudit(pid: number, comm: string, syscall: string, args: string[]) {
      if (!this.services?.behavioral) return "PASS";
      return await this.services.behavioral.checkSyscallAnomalies(pid, comm, syscall, args);
  }

  /**
   * Executes a predefined security playbook by name.
   */
  public async runPlaybook(name: string) {
    if (!this.services) return;

    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:orchestration:playbook_service",
        message: `Manually triggering playbook: ${name}`
    });
    
    switch (name) {
      case "Emergency Isolation":
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: "Protocol: Emergency Isolation. Isolating local node from mesh."
        });
        await this.services.mesh.isolateNode("local");
        await this.services.notifications.notify({
          type: "audit",
          message: "AUTO-DEFENSE: Local node isolated from mesh due to critical threat detection."
        });
        break;
      
      case "Force Lockdown":
        await this.services.protection.lockdown();
        break;

      default:
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `Unknown playbook requested: ${name}`
        });
    }
  }

  private updateThreatScore(nodeId: string, inc: number) {
    const score = (this.threatScores.get(nodeId) || 0) + inc;
    this.threatScores.set(nodeId, score);
    
    if (score >= this.ISOLATION_THRESHOLD) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:orchestration:playbook_service",
          message: `Node ${nodeId} reached isolation threshold (${score}). Executing isolation.`
      });
      this.services?.mesh.isolateNode(nodeId);
      // Reset after isolation
      this.threatScores.set(nodeId, 0);
    }
  }

  override async shutdown(): Promise<import("@core/result.ts").Result<void>> {
    const { ok } = await import("@core/result.ts");
    this.services = undefined;
    return ok(undefined);
  }
}
