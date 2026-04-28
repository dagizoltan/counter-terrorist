import { CommandResult } from "../../core/ports.ts";
import { SystemExecutor } from "../../infrastructure/system_executor.ts";
import { FirewallProvider } from "./interfaces.ts";

export class WindowsFirewallProvider implements FirewallProvider {
  constructor(private executor: SystemExecutor) {}
  async blockIp(ip: string): Promise<CommandResult> {
    // netsh advfirewall firewall add rule name="CT-Block-${ip}" dir=in action=block remoteip=${ip}
    return await executor.execute("netsh", [
        "advfirewall", "firewall", "add", "rule",
        `name=CT-Block-${ip}`,
        "dir=in",
        "action=block",
        `remoteip=${ip}`
    ]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await executor.execute("netsh", [
        "advfirewall", "firewall", "delete", "rule",
        `name=CT-Block-${ip}`
    ]);
  }

  async getStatus(): Promise<CommandResult> {
    return await executor.execute("netsh", ["advfirewall", "show", "allprofiles"]);
  }
}
