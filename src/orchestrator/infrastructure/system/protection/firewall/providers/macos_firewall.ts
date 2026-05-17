import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { CommandResult } from "@core/ports.ts";

export class MacosFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "BlockIp", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "ShadowBanIp", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "UnblockIp", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    // BUG-8.8 FIX: Use sentinel-darwin for process control
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    // BUG-8.8 FIX: Use sentinel-darwin for process control
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "QuarantineProcess", pid });
  }

  async enforcePid(_pid: number): Promise<CommandResult> {
    return { success: false, stdout: "", stderr: "EndpointSecurity LSM not yet implemented for macOS." };
  }

  async unenforcePid(_pid: number): Promise<CommandResult> {
    return { success: false, stdout: "", stderr: "EndpointSecurity LSM not yet implemented for macOS." };
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "GetStatus" });
  }

  async lockdown(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "Lockdown" });
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "AllowPort", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "DenyPort", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "FlushRules" });
  }
}
