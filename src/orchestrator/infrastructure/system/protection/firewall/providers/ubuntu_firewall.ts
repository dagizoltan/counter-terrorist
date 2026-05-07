import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult, LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    // Transitioning from UFW to high-performance eBPF/XDP blocking
    return await this.sidecar.sendCommand("ebpf", { type: "BLOCK_IP", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Transitioning from 'tc' binary to native eBPF Traffic Control
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "FIREWALL",
        message: `Shadow Banning IP: ${ip} via Native eBPF TC hooks.`
    });
    
    return await this.sidecar.sendCommand("ebpf", { type: "SHADOW_BAN", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("ebpf", { type: "UNBLOCK_IP", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "QuarantineProcess", pid });
  }

  async dumpProcessForensics(pid: number): Promise<CommandResult> {
    const dumpPath = `./volume/storage/forensics/forensics_process_${pid}_${Date.now()}.dump`;
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "FORENSICS",
        message: `Dumping process ${pid} memory to ${dumpPath}`
    });
    
    return await this.sidecar.sendCommand("blocker", { type: "DumpProcess", pid, path: dumpPath });
  }

  async getStatus(): Promise<CommandResult> {
    // Hermetic: Query the agent status instead of UFW
    return await this.sidecar.sendCommand("ebpf", { type: "GET_STATUS" });
  }

  async lockdown(): Promise<CommandResult> {
    // Global lockdown via eBPF XDP default-deny
    return await this.sidecar.sendCommand("ebpf", { type: "LOCKDOWN" });
  }
  
  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("ebpf", { type: "ALLOW_PORT", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("ebpf", { type: "DENY_PORT", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    // Hermetic: Flush agent maps instead of resetting UFW
    return await this.sidecar.sendCommand("ebpf", { type: "FLUSH_RULES" });
  }
}
