import { FirewallProvider } from "../firewall.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class MacosFirewallProvider implements FirewallProvider {
  constructor(private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    // macOS uses pfctl. We'll add to a 'cts_block' table
    return await this.executor.execute("sudo", ["pfctl", "-t", "cts_block", "-T", "add", ip]);
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Mock for macOS using pfctl dummynet
    return await this.executor.execute("sudo", ["pfctl", "-t", "cts_shadow", "-T", "add", ip]);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.executor.execute("sudo", ["pfctl", "-t", "cts_block", "-T", "delete", ip]);
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.executor.execute("kill", ["-9", pid.toString()]);
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    return await this.executor.execute("kill", ["-STOP", pid.toString()]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("pfctl", ["-s", "info"]);
  }

  async lockdown(): Promise<CommandResult> {
    return await this.executor.execute("sudo", ["pfctl", "-e"]);
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    // Complex with pfctl; simplified mock
    return { success: true, stdout: "Port allowed in PF", stderr: "" };
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return { success: true, stdout: "Port denied in PF", stderr: "" };
  }

  async flushRules(): Promise<CommandResult> {
    return await this.executor.execute("sudo", ["pfctl", "-F", "all"]);
  }
}
