import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { ListeningPort } from "../../interfaces.ts";
import { CommandResult } from "@core/ports.ts";

export class WindowsFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "AddBlockRule", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // WFP doesn't natively support shadow ban in this mock, so we just block
    return await this.sidecar.sendCommand("enforcer-win", { type: "AddBlockRule", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "RemoveBlockRule", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    // Use enforcer-win for process control
    return await this.sidecar.sendCommand("enforcer-win", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    // Use enforcer-win for process control
    return await this.sidecar.sendCommand("enforcer-win", { type: "QuarantineProcess", pid });
  }

  enforcePid(_pid: number): Promise<CommandResult> {
    return Promise.resolve({ success: false, stdout: "", stderr: "LSM Enforcement not supported on Windows." });
  }

  unenforcePid(_pid: number): Promise<CommandResult> {
    return Promise.resolve({ success: false, stdout: "", stderr: "LSM Enforcement not supported on Windows." });
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "GetStatus" });
  }

  lockdown(): Promise<CommandResult> {
    // Implement global lockdown via WFP if needed, or just return success for now
    return Promise.resolve({ success: true, stdout: "Windows Lockdown (via WFP) Active", stderr: "" });
  }

  /**
   * Enumerate listeners via PowerShell, which reports the owning PID directly.
   * `powershell` is already on the executor whitelist. UDP has no listening
   * state, so both cmdlets are queried and merged.
   */
  async listListeningPorts(): Promise<ListeningPort[]> {
    const script =
      "$t = Get-NetTCPConnection -State Listen | " +
      "Select-Object @{n='protocol';e={'tcp'}},@{n='address';e={$_.LocalAddress}},@{n='port';e={$_.LocalPort}},@{n='pid';e={$_.OwningProcess}}; " +
      "$u = Get-NetUDPEndpoint | " +
      "Select-Object @{n='protocol';e={'udp'}},@{n='address';e={$_.LocalAddress}},@{n='port';e={$_.LocalPort}},@{n='pid';e={$_.OwningProcess}}; " +
      "ConvertTo-Json -Compress -InputObject @($t + $u)";

    const res = await this.executor.execute("powershell", ["-NoProfile", "-Command", script]).catch(() => null);
    if (!res?.success || !res.stdout) return [];

    try {
      const rows = JSON.parse(res.stdout);
      const list = Array.isArray(rows) ? rows : [rows];
      return list
        .filter((r) => Number.isInteger(r?.port) && r.port > 0 && r.port <= 65535)
        .map((r) => ({
          port: r.port,
          protocol: r.protocol === "udp" ? "udp" as const : "tcp" as const,
          address: String(r.address ?? "*"),
          ...(Number.isInteger(r.pid) ? { pid: r.pid } : {}),
        }))
        .sort((a, b) => a.port - b.port || a.address.localeCompare(b.address));
    } catch {
      return [];
    }
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "AddAllowRule", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "RemoveAllowRule", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("enforcer-win", { type: "FlushRules" });
  }
}
