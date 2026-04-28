import { CommandResult, commandManager } from "../command_manager.ts";
import { FirewallProvider } from "./interfaces.ts";

export class WindowsFirewallProvider implements FirewallProvider {
  async blockIp(ip: string): Promise<CommandResult> {
    // netsh advfirewall firewall add rule name="CT-Block-${ip}" dir=in action=block remoteip=${ip}
    return await commandManager.execute("netsh", [
        "advfirewall", "firewall", "add", "rule",
        `name=CT-Block-${ip}`,
        "dir=in",
        "action=block",
        `remoteip=${ip}`
    ]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await commandManager.execute("netsh", [
        "advfirewall", "firewall", "delete", "rule",
        `name=CT-Block-${ip}`
    ]);
  }

  async getStatus(): Promise<CommandResult> {
    return await commandManager.execute("netsh", ["advfirewall", "show", "allprofiles"]);
  }
}
