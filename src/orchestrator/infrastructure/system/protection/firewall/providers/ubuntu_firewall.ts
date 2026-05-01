import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "../../../../runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "BlockIP", payload: { ip } });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Mock shadow ban (traffic shaping)
    return await this.executor.execute("tc", ["qdisc", "add", "dev", "eth0", "root", "tbf", "rate", "1kbit", "latency", "50ms", "burst", "1000"]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "UnblockIP", payload: { ip } });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.executor.execute("kill", ["-9", pid.toString()]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("ufw", ["status"]);
  }

  async lockdown(): Promise<CommandResult> {
    return await this.executor.execute("ufw", ["default", "deny", "incoming"]);
  }
}
