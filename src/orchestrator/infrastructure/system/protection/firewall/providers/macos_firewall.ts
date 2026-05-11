import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { CommandResult } from "@core/ports.ts";

export class MacosFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "BlockIp", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "ShadowBanIp", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "UnblockIp", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "QuarantineProcess", pid });
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "GetStatus" });
  }

  async lockdown(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "Lockdown" });
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "AllowPort", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "DenyPort", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("esf", { type: "FlushRules" });
  }
}
