import { EventBus } from "./index.ts";
import { AuditService } from "./audit.ts";
import { SidecarManager } from "../infrastructure/sidecar_manager.ts";

export class ChaosEngine {
  constructor(
    private eventBus: EventBus,
    private auditService: AuditService,
    private sidecar: SidecarManager
  ) {}

  async simulateBruteForce(ip: string = "192.168.99.100") {
    console.log(`[CHAOS] Simulating SSH Brute Force from ${ip}`);
    
    // Send fake events to the honeypot pipeline
    for (let i = 0; i < 5; i++) {
        this.sidecar.emitEvent("honeypot", {
            event: {
                type: "PortAccess",
                payload: { port: 22, source_ip: ip }
            }
        });
        await new Promise(r => setTimeout(r, 200));
    }

    await this.auditService.logEvent({
        type: "THREAT",
        message: `CHAOS_SIM: Multi-vector brute force attempt detected from ${ip}`,
        data: { simulation: true, vector: "SSH_BRUTE_FORCE" }
    });
  }

  async simulateCanaryTrigger(path: string = "./vault_credentials.xlsx") {
    console.log(`[CHAOS] Simulating Canary Trigger: ${path}`);
    
    this.sidecar.emitEvent("fim", {
        type: "Access",
        path: path,
        process: "scp",
        pid: 9999
    });

    await this.auditService.logEvent({
        type: "CRITICAL",
        message: `CHAOS_SIM: Unauthorized access to canary breadcrumb: ${path}`,
        data: { simulation: true, vector: "DATA_EXFIL" }
    });
  }

  async simulateMalwareExecution(proc: string = "xmrig") {
    console.log(`[CHAOS] Simulating Malware Execution: ${proc}`);
    
    this.sidecar.emitEvent("ebpf", {
        type: "Syscall",
        data: {
            syscall: "execve",
            comm: proc,
            pid: 8888,
            args: ["--donate-level", "1"]
        }
    });

    await this.auditService.logEvent({
        type: "THREAT",
        message: `CHAOS_SIM: Cryptominer signature detected in kernel: ${proc}`,
        data: { simulation: true, vector: "UNAUTHORIZED_COMPUTE" }
    });
  }
}
