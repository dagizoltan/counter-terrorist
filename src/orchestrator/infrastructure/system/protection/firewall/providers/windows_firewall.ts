import { FirewallProvider } from "../firewall.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class WindowsFirewallProvider implements FirewallProvider {
  constructor(private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "firewall", "add", "rule", `name=Block ${ip}`, "dir=in", "action=block", `remoteip=${ip}`]);
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Mock shadow ban for Windows
    return await this.executor.execute("netsh", ["advfirewall", "firewall", "add", "rule", `name=Shadow ${ip}`, "dir=in", "action=block", `remoteip=${ip}`]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "firewall", "delete", "rule", `name=Block ${ip}`]);
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.executor.execute("taskkill", ["/F", "/PID", pid.toString()]);
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    return await this.executor.execute("powershell", ["-Command", `Suspend-Process -Id ${pid}`]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "show", "currentprofile"]);
  }

  async lockdown(): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "set", "allprofiles", "state", "on"]);
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "firewall", "add", "rule", `name=Allow ${port}`, "dir=in", "action=allow", `protocol=${protocol}`, `localport=${port}`]);
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "firewall", "delete", "rule", `name=Allow ${port}`]);
  }

  async flushRules(): Promise<CommandResult> {
    return await this.executor.execute("netsh", ["advfirewall", "firewall", "delete", "rule", "all"]);
  }
}
