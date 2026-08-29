import { LogSeverity, LogType, LoggingPort, EventBusPort, ProtectionPort, NotificationPort, MeshPort } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";
import { isValidIP, isCriticalInfrastructure } from "@infrastructure/system/validation.ts";

import { ServiceLocatorPort } from "../../core/ports.ts";

export class PlaybookService extends BaseService {
  declare public locator?: ServiceLocatorPort;
  private threatScores: Map<string, number> = new Map();
  private unsubscribers: (() => void)[] = [];
  private readonly ISOLATION_THRESHOLD = 5;

  constructor(private logging: LoggingPort = loggingService) {
    super();
  }

  public setLocator(locator: ServiceLocatorPort) {
    this.locator = locator;
  }

  public get eventBusDelegate(): EventBusPort | undefined {
    return this.locator?.get<EventBusPort>("eventBus");
  }

  private get protection(): ProtectionPort | undefined {
    return this.locator?.get<ProtectionPort>("protection");
  }

  private get notifications(): NotificationPort | undefined {
    return this.locator?.get<NotificationPort>("notifications");
  }

  private get mesh(): MeshPort | undefined {
    return this.locator?.get<MeshPort>("mesh");
  }

  private get shadowProtocol(): import("../protection/shadow_protocol_service.ts").ShadowProtocolService | undefined {
    if (!this.locator?.has("shadowProtocol")) return undefined;
    return this.locator.get<import("../protection/shadow_protocol_service.ts").ShadowProtocolService>("shadowProtocol");
  }

  private get behavioral(): import("../analysis/behavioral_service.ts").BehavioralService | undefined {
    if (!this.locator?.has("behavioral")) return undefined;
    return this.locator.get<import("../analysis/behavioral_service.ts").BehavioralService>("behavioral");
  }

  protected override onInit(): Promise<Result<void>> {
    if (!this.locator) return Promise.resolve(ok(undefined));

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:playbook_service",
        message: "Initializing Automated Response Engine via Service Locator"
    });

    const eventBus = this.eventBusDelegate;
    if (!eventBus) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: "CRITICAL: EventBus not available in Service Locator during init."
        });
        return Promise.resolve(ok(undefined));
    }

    // Honeypot Playbook: Auto-block any IP that connects to honey ports
    this.unsubscribers.push(eventBus.on("HONEYPOT", async (payload: any) => {
      if (payload.type !== "PortAccess") return;
      const port = typeof payload.port === "number" ? payload.port : Number(payload.port);
      const source_ip = typeof payload.source_ip === "string" ? payload.source_ip : undefined;
      if (!source_ip) return;
        
        if (!isValidIP(source_ip) || isCriticalInfrastructure(source_ip)) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.INFO,
              caller: "orchestrator:domain:orchestration:playbook_service",
              message: `Honeypot trigger from ${source_ip} (WHITELISTED/INVALID). Skipping block.`
          });
          return;
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `Honeypot trigger on port ${port} from ${source_ip}. Executing auto-block.`
        });
        
        this.updateThreatScore("local", 1);
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `Starting forensic capture for IP: ${source_ip}`
        });
        if (this.protection?.pcap) {
            try {
              await this.protection.pcap.startCapture("any", 60, `threat_${source_ip}_${Date.now()}.pcap`, `host ${source_ip}`);
            } catch (err) {
              this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:orchestration:playbook_service",
                message: `Forensic capture failed for ${source_ip}: ${err instanceof Error ? err.message : String(err)}`
              }).catch(() => {});
            }
        }

        try {
          if (this.protection?.firewall) {
              await this.protection.firewall.blockIp(source_ip);
          }
          if (this.notifications) {
              await this.notifications.notify({
                type: "audit",
                message: `IP ${source_ip} automatically blocked after honeypot access on port ${port}`
              });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:orchestration:playbook_service",
              message: `Failed to block IP ${source_ip}: ${message}`
          });
        }
      }
    ));

    // FIM Playbook: High-priority notification on critical file change
    this.unsubscribers.push(eventBus.on("DRIFT_PROCESS", async (payload: { path: string, action: string }) => {
      if (!payload.path || !payload.action) return;
      const path = payload.path;
      const action = payload.action;
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:orchestration:playbook_service",
          message: `FIM trigger: ${action} detected on ${path}`
      });
      
      await this.notifications?.notify({
        type: "audit",
        message: `Unauthorized ${action} detected on ${path}. Investigation required immediately.`
      });

      this.updateThreatScore("local", 2);
    }));

    // eBPF Playbook: Monitor suspicious syscalls and quarantine
    this.unsubscribers.push(eventBus.on("EBPF_CRITICAL", async (payload: { comm: string, syscall: string, pid?: number }) => {
      if (!payload.comm || !payload.syscall) return;
      const pid = payload.pid ?? NaN;
      const comm = payload.comm;
      const syscall = payload.syscall;
      if (syscall !== "ptrace") return;
      
      this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: `SUSPICIOUS PTRACE detected from ${comm} (PID: ${pid}). Executing Quarantine.`
        });
        
        try {
          if (this.protection?.firewall) {
              await this.protection.firewall.killProcess(pid);
          }
          if (this.shadowProtocol) {
              await this.shadowProtocol.activate(); // ENGAGE SHADOW MODE
          }
          if (this.notifications) {
              await this.notifications.notify({
                type: "audit",
                message: `Process ${comm} (PID: ${pid}) quarantined due to ptrace violation. SHADOW PROTOCOL ENGAGED.`
              });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:orchestration:playbook_service",
              message: `Failed to quarantine process ${pid}: ${message}`
          });
        }
        
        this.updateThreatScore("local", 3);
    }));

    // Mesh Playbook: Monitor node threat levels
    this.unsubscribers.push(eventBus.on("THREAT", (payload: any) => {
      const nodeId = payload.nodeId ?? "local";
      const severity = payload.severity;
      const path = payload.path;
      if (severity === "HIGH" || severity === "CRITICAL" || !!path) {
         this.updateThreatScore(nodeId, 1);
      }
    }));

    // Artifact Playbook: Proactive Quarantine & Containment
    this.unsubscribers.push(eventBus.on("ARTIFACT_FOUND", async (payload: any) => {
       if (!payload.indicator) return;
       await this.executeArtifactContainment(payload.indicator, payload);
    }));

    // Cross-Platform Playbook Hooks
    this.unsubscribers.push(eventBus.on("ES_EXEC", (payload: any) => {
        if (!payload.path) return;
        const path = payload.path;
        const signing_id = payload.signing_id;
        if (path.includes("curl") || path.includes("wget")) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "PLAYBOOK:ESF",
                message: `macOS Policy Violation: Unauthorized binary execution detected: ${path} (ID: ${signing_id})`
            });
            this.updateThreatScore("local", 1);
        }
    }));

    this.unsubscribers.push(eventBus.on("ETW_PROCESS", (payload: any) => {
        if (!payload.command_line) return;
        const process_name = payload.process_name;
        const command_line = payload.command_line;
        if (command_line.includes("powershell -enc")) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "PLAYBOOK:ETW",
                message: `Windows Policy Violation: Encoded PowerShell detected: ${process_name}`
            });
            this.updateThreatScore("local", 2);
        }
    }));
    return Promise.resolve(ok(undefined));
  }

  /**
   * Executes the 'Artifact Containment' playbook.
   * Multi-stage response to binary threats.
   */
  public async executeArtifactContainment(artifact: string, metadata: Record<string, unknown>) {
      if (!this.locator) return;

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "PLAYBOOK:ARTIFACT",
          message: `[PLAYBOOK] Engaging 'Artifact Containment' for ${artifact.slice(0, 8)}...`
      });

      // 1. Proactive Quarantine (If path is known or globally applicable)
      // In a real environment, the agent would search and move.
      if (typeof metadata.path === "string") {
          await this.protection?.antivirus?.quarantine(metadata.path);
      }

      // 2. Mesh Isolation (OpSec baseline)
      await this.mesh?.isolateNode("local");

      // 3. Trigger Forensic Acquisition
      try {
        await this.protection?.pcap.startCapture("any", 120, `artifact_containment_${artifact.slice(0, 8)}.pcap`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "PLAYBOOK:ARTIFACT",
          message: `Artifact containment capture failed: ${message}`
        }).catch(() => {});
      }

      await this.notifications?.notify({
          type: "audit",
          message: `AUTOPILOT: Artifact Containment engaged for ${artifact.slice(0, 8)}. Host isolated. Forensic capture active.`
      });
  }

  /**
   * Executes a behavioral audit on a specific syscall event.
   */
  public async executeBehavioralAudit(pid: number, comm: string, syscall: string, args: string[]) {
      if (!this.behavioral) return "PASS";
      return await this.behavioral.checkSyscallAnomalies(pid, comm, syscall, args);
  }

  /**
   * Executes a predefined security playbook by name.
   */
  public async runPlaybook(name: string) {
    if (!this.locator) return;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:orchestration:playbook_service",
        message: `Manually triggering playbook: ${name}`
    });
    
    switch (name) {
      case "Emergency Isolation":
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:playbook_service",
            message: "Protocol: Emergency Isolation. Isolating local node from mesh."
        });
        await this.mesh?.isolateNode("local");
        await this.notifications?.notify({
          type: "audit",
          message: "AUTO-DEFENSE: Local node isolated from mesh due to critical threat detection."
        });
        break;
      
      case "Force Lockdown":
        await this.protection?.lockdown();
        break;

      default:
        this.logging.log({
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
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:orchestration:playbook_service",
          message: `Node ${nodeId} reached isolation threshold (${score}). Executing isolation.`
      });
      this.mesh?.isolateNode(nodeId);
      // Reset after isolation
      this.threatScores.set(nodeId, 0);
    }
  }

  protected override onShutdown(): Promise<Result<void>> {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    this.locator = undefined;
    return Promise.resolve(ok(undefined));
  }
}
