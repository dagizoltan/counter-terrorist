import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult, LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { isAllowedSidecar } from "@infrastructure/system/validation.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  private isSentinelAvailable(): boolean {
    return isAllowedSidecar("sentinel") && this.sidecar.isRunning("sentinel");
  }

  async blockIp(ip: string): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "BLOCK_IP", ip });
    }
    // Fallback to UFW
    return await this.executor.execute("ufw", ["deny", "from", ip]);
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:infra:system:protection:firewall",
          message: `Shadow Banning IP: ${ip} via Native eBPF TC hooks.`
      });
      return await this.sidecar.sendCommand("sentinel", { type: "SHADOW_BAN", ip });
    }
    
    // No native shadow ban in UFW, fallback to standard block
    return await this.blockIp(ip);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "UNBLOCK_IP", ip });
    }
    return await this.executor.execute("ufw", ["delete", "deny", "from", ip]);
  }

  async killProcess(pid: number): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "KillProcess", pid });
    }
    return await this.executor.execute("kill", ["-9", pid.toString()]);
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "QuarantineProcess", pid });
    }
    // SIGSTOP for quarantine
    return await this.executor.execute("kill", ["-STOP", pid.toString()]);
  }

  async dumpProcessForensics(pid: number): Promise<CommandResult> {
    const dumpPath = `./volume/storage/forensics/forensics_process_${pid}_${Date.now()}.dump`;
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "DumpProcess", pid, path: dumpPath });
    }
    // Fallback: gcore if available
    return await this.executor.execute("gcore", ["-o", dumpPath, pid.toString()]);
  }

  async getStatus(): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "GET_STATUS" });
    }
    return await this.executor.execute("ufw", ["status"]);
  }

  async lockdown(): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "LOCKDOWN" });
    }
    return await this.executor.execute("ufw", ["default", "deny", "incoming"]);
  }
  
  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "ALLOW_PORT", port, protocol });
    }
    return await this.executor.execute("ufw", ["allow", `${port}/${protocol}`]);
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "DENY_PORT", port, protocol });
    }
    return await this.executor.execute("ufw", ["deny", `${port}/${protocol}`]);
  }

  async flushRules(): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "FLUSH_RULES" });
    }
    return await this.executor.execute("ufw", ["--force", "reset"]);
  }
}
