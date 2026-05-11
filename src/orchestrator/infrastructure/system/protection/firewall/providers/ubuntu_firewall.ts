import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult, LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    // High-performance eBPF/XDP blocking via native sentinel agent
    return await this.sidecar.sendCommand("sentinel", { type: "BLOCK_IP", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Native eBPF TC hooks via sentinel agent
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:infra:system:protection:firewall",
        message: `Shadow Banning IP: ${ip} via Native eBPF TC hooks.`
    });
    
    return await this.sidecar.sendCommand("sentinel", { type: "SHADOW_BAN", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel", { type: "UNBLOCK_IP", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer", { type: "QuarantineProcess", pid });
  }

  async dumpProcessForensics(pid: number): Promise<CommandResult> {
    const dumpPath = `./volume/storage/forensics/forensics_process_${pid}_${Date.now()}.dump`;
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:infra:system:protection:forensics",
        message: `Dumping process ${pid} memory to ${dumpPath}`
    });
    
    return await this.sidecar.sendCommand("enforcer", { type: "DumpProcess", pid, path: dumpPath });
  }

  async getStatus(): Promise<CommandResult> {
    // Hermetic: Query the sentinel agent status
    return await this.sidecar.sendCommand("sentinel", { type: "GET_STATUS" });
  }

  async lockdown(): Promise<CommandResult> {
    // Global lockdown via eBPF XDP default-deny
    return await this.sidecar.sendCommand("sentinel", { type: "LOCKDOWN" });
  }
  
  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel", { type: "ALLOW_PORT", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel", { type: "DENY_PORT", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    // Hermetic: Flush sentinel agent maps
    return await this.sidecar.sendCommand("sentinel", { type: "FLUSH_RULES" });
  }
}
