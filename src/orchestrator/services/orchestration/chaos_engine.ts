import { EventBus } from "@services/index.ts";
import { AuditService } from "../forensics/audit.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

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
            sidecar: "honeypot",
            event: {
                type: "PortAccess",
                src_ip: ip,
                dest_port: 22
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
    
    // FIM event schema expects { resource, expected, actual } or similar? 
    // Actually fim is not in the registry yet, but let's be safe.
    this.sidecar.emitEvent("fim", {
        type: "FILE_EVENT",
        path: path,
        comm: "scp",
        action: "OPEN"
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
