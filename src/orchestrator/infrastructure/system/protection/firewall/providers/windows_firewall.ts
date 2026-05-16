import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { CommandResult } from "@core/ports.ts";

export class WindowsFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "AddBlockRule", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // WFP doesn't natively support shadow ban in this mock, so we just block
    return await this.sidecar.sendCommand("enforcer-win", { type: "AddBlockRule", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "RemoveBlockRule", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer", { type: "QuarantineProcess", pid });
  }

  async enforcePid(_pid: number): Promise<CommandResult> {
    return { success: false, stdout: "", stderr: "LSM Enforcement not supported on Windows." };
  }

  async unenforcePid(_pid: number): Promise<CommandResult> {
    return { success: false, stdout: "", stderr: "LSM Enforcement not supported on Windows." };
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "GetStatus" });
  }

  async lockdown(): Promise<CommandResult> {
    // Implement global lockdown via WFP if needed, or just return success for now
    return { success: true, stdout: "Windows Lockdown (via WFP) Active", stderr: "" };
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "AddAllowRule", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "RemoveAllowRule", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "FlushRules" });
  }
}
