import { CommandResult, commandManager } from "../command_manager.ts";
import { FirewallProvider } from "./interfaces.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  async blockIp(ip: string): Promise<CommandResult> {
    const command = {
      type: "BlockIp",
      payload: { ip }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    const command = {
      type: "UnblockIp",
      payload: { ip }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async getStatus(): Promise<CommandResult> {
    return await commandManager.execute("ufw", ["status"]);
  }
}
