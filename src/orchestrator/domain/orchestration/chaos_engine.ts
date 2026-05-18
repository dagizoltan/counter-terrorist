import { EventBus } from "@domain/index.ts";
import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, LogSeverity, LogType, CommandPort } from "@core/ports.ts";

export class ChaosEngine {
  private logging: LoggingPort;

  constructor(
    private eventBus: EventBus,
    private auditService: AuditService,
    private sidecar: CommandPort
  ) {
    this.logging = auditService.getLogging();
  }

  async simulateBruteForce(ip: string = "192.168.99.100") {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.DEBUG,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:chaos_engine",
        message: `Simulating SSH Brute Force from ${ip}`
    });
    
    // Send fake events to the honeypot pipeline (Unified Schema)
    // BUG-4.23 FIX: Reduce noise and handle event storming by deduplicating simulation signals
    for (let i = 0; i < 3; i++) {
        this.sidecar.emitEvent("decoy", {
            success: true,
            data: {
                type: "PortAccess",
                source_ip: ip,
                port: 22,
                simulation: true
            },
            timestamp: new Date().toISOString()
        });
        await new Promise(r => setTimeout(r, 500));
    }

    await this.auditService.logEvent({
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:orchestration:chaos_engine:simulator",
        message: `CHAOS_SIM: Multi-vector brute force attempt detected from ${ip}`,
        data: { simulation: true, vector: "SSH_BRUTE_FORCE" }
    });
  }

  async simulateCanaryTrigger(path: string = "./vault_credentials.xlsx") {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.DEBUG,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:chaos_engine",
        message: `Simulating Canary Trigger: ${path}`
    });
    
    this.sidecar.emitEvent("fim", {
        success: true,
        data: {
            type: "FileAlert",
            path: path,
            action: "OPEN"
        },
        timestamp: new Date().toISOString()
    });

    await this.auditService.logEvent({
        type: LogType.AUDIT,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:domain:orchestration:chaos_engine:simulator",
        message: `CHAOS_SIM: Unauthorized access to canary breadcrumb: ${path}`,
        data: { simulation: true, vector: "DATA_EXFIL" }
    });
  }

  async simulateMalwareExecution(proc: string = "xmrig") {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.DEBUG,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:chaos_engine",
        message: `Simulating Malware Execution: ${proc}`
    });
    
    this.sidecar.emitEvent("ebpf", {
        success: true,
        data: {
            type: "SYSCALL_EVENT",
            syscall: "ptrace", // ptrace triggers immediate quarantine
            comm: proc,
            pid: 8888
        },
        timestamp: new Date().toISOString()
    });

    await this.auditService.logEvent({
        type: LogType.AUDIT,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:domain:orchestration:chaos_engine:simulator",
        message: `CHAOS_SIM: Cryptominer signature detected in kernel: ${proc}`,
        data: { simulation: true, vector: "UNAUTHORIZED_COMPUTE" }
    });
  }
}
