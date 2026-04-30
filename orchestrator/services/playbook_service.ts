import { SidecarManager } from "../infrastructure/sidecar_manager.ts";
import { ProtectionPort } from "../core/ports.ts";
import { NotificationService } from "./alerts.ts";
import { loggingService, SyslogSeverity } from "../infrastructure/logging.ts";
import { MeshManager } from "./mesh.ts";

export class PlaybookService {
  constructor(
    private sidecarManager: SidecarManager,
    private protection: ProtectionPort,
    private notifications: NotificationService,
    private meshManager: MeshManager
  ) {}

  private threatScores: Map<string, number> = new Map();
  private readonly ISOLATION_THRESHOLD = 5;

  public async init() {
    loggingService.log("[PLAYBOOK] Initializing Automated Response Engine", SyslogSeverity.INFORMATIONAL);

    // Honeypot Playbook: Auto-block any IP that connects to honey ports
    this.sidecarManager.onEvent("honeypot", async (data) => {
      if (data.event?.type === "PortAccess") {
        const { port, source_ip } = data.event.payload;
        loggingService.log(`[PLAYBOOK] Honeypot trigger on port ${port} from ${source_ip}. Executing auto-block.`, SyslogSeverity.WARNING);
        
        // Increase threat score for the local node (or remote if tracked)
        this.updateThreatScore("local", 1);
        
        // Forensics: Automatically start a packet capture for this IP
        loggingService.log(`[PLAYBOOK] Starting forensic capture for IP: ${source_ip}`, SyslogSeverity.INFORMATIONAL);
        this.protection.pcap.startCapture("any", 60, `threat_${source_ip}_${Date.now()}.pcap`, `host ${source_ip}`).catch(err => {
           loggingService.log(`[PLAYBOOK] Failed to start forensic capture: ${err.message}`, SyslogSeverity.ERROR);
        });

        try {
          await this.protection.firewall.blockIp(source_ip);
          await this.notifications.notify({
            type: "HIGH",
            message: `IP ${source_ip} automatically blocked after honeypot access on port ${port}`
          });
        } catch (err: any) {
          loggingService.log(`[PLAYBOOK] Failed to block IP ${source_ip}: ${err.message}`, SyslogSeverity.ERROR);
        }
      }
    });

    // FIM Playbook: High-priority notification on critical file change
    this.sidecarManager.onEvent("fim", async (data) => {
      if (data.event?.type === "FileAlert") {
        const { path, action } = data.event.payload;
        loggingService.log(`[PLAYBOOK] FIM trigger: ${action} detected on ${path}`, SyslogSeverity.CRITICAL);
        
        await this.notifications.notify({
          type: "CRITICAL",
          message: `Unauthorized ${action} detected on ${path}. Investigation required immediately.`
        });

        this.updateThreatScore("local", 2);
      }
    });

    // eBPF Playbook: Monitor suspicious syscalls and quarantine
    this.sidecarManager.onEvent("ebpf", async (data) => {
      if (data.event?.type === "SYSCALL_EVENT") {
        const { pid, comm, syscall } = data.event;
        
        if (syscall === "ptrace") {
          loggingService.log(`[PLAYBOOK] SUSPICIOUS PTRACE detected from ${comm} (PID: ${pid}). Executing Quarantine.`, SyslogSeverity.CRITICAL);
          
          try {
            await this.protection.firewall.killProcess(pid);
            await this.notifications.notify({
              type: "CRITICAL",
              message: `Process ${comm} (PID: ${pid}) quarantined after suspicious ptrace() syscall.`
            });
          } catch (err: any) {
            loggingService.log(`[PLAYBOOK] Failed to quarantine process ${pid}: ${err.message}`, SyslogSeverity.ERROR);
          }
          
          this.updateThreatScore("local", 3);
        }
      }
    });

    // Mesh Playbook: Monitor node threat levels
    this.sidecarManager.onEvent("scanner", async (data) => {
      if (data.event?.type === "ThreatDetected") {
        const { nodeId, severity } = data.event.payload;
        if (severity === "HIGH" || severity === "CRITICAL") {
           this.updateThreatScore(nodeId, 1);
        }
      }
    });
  }

  private updateThreatScore(nodeId: string, inc: number) {
    const score = (this.threatScores.get(nodeId) || 0) + inc;
    this.threatScores.set(nodeId, score);
    
    if (score >= this.ISOLATION_THRESHOLD) {
      loggingService.log(`[PLAYBOOK] Node ${nodeId} reached isolation threshold (${score}). Executing isolation.`, SyslogSeverity.CRITICAL);
      this.meshManager.isolateNode(nodeId);
      // Reset after isolation
      this.threatScores.set(nodeId, 0);
    }
  }
}
