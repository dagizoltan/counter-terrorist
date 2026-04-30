import { CommandResult } from "../../core/ports.ts";
import { SidecarManager } from "../../infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../../infrastructure/system_executor.ts";
import { FirewallProvider } from "../interfaces.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    // We try to use the blocker agent first as it might have CAP_NET_ADMIN
    const command = {
      type: "BlockIp",
      payload: { ip }
    };
    const agentResult = await this.sidecar.runSidecar("blocker", [JSON.stringify(command)]);
    
    // If agent fails (e.g. no CAP_NET_ADMIN), fallback to sudo ufw if configured
    if (!agentResult.success) {
      return await this.executor.execute("sudo", ["ufw", "deny", "from", ip]);
    }
    return agentResult;
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    const command = {
      type: "UnblockIp",
      payload: { ip }
    };
    const agentResult = await this.sidecar.runSidecar("blocker", [JSON.stringify(command)]);

    if (!agentResult.success) {
      return await this.executor.execute("sudo", ["ufw", "delete", "deny", "from", ip]);
    }
    return agentResult;
  }

  async killProcess(pid: number): Promise<CommandResult> {
    const command = {
      type: "KillProcess",
      payload: { pid }
    };
    return await this.sidecar.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("sudo", ["ufw", "status"]);
  }
}
