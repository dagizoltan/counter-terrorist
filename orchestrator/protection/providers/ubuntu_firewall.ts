import { CommandResult } from "../../core/ports.ts";
import { SidecarManager } from "../../infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../../infrastructure/system_executor.ts";
import { FirewallProvider } from "../interfaces.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    const command = {
      type: "BlockIp",
      payload: { ip }
    };
    return await this.sidecar.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    const command = {
      type: "UnblockIp",
      payload: { ip }
    };
    return await this.sidecar.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("ufw", ["status"]);
  }
}
