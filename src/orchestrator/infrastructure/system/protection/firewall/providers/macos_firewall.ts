import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { ListeningPort } from "../../interfaces.ts";
import { CommandResult } from "@core/ports.ts";

export class MacosFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "BlockIp", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "ShadowBanIp", ip });
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "UnblockIp", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    // Use sentinel-darwin for process control
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "KillProcess", pid });
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    // Use sentinel-darwin for process control
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "QuarantineProcess", pid });
  }

  enforcePid(_pid: number): Promise<CommandResult> {
    return Promise.resolve({ success: false, stdout: "", stderr: "EndpointSecurity LSM not yet implemented for macOS." });
  }

  unenforcePid(_pid: number): Promise<CommandResult> {
    return Promise.resolve({ success: false, stdout: "", stderr: "EndpointSecurity LSM not yet implemented for macOS." });
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "GetStatus" });
  }

  async lockdown(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "Lockdown" });
  }

  /**
   * Parse `netstat -anv` into listeners. BSD netstat has no process column
   * without elevated lsof, so pid/process are left unset rather than guessed.
   *
   *   tcp4  0 0  *.22   *.*   LISTEN
   */
  async listListeningPorts(): Promise<ListeningPort[]> {
    const res = await this.sidecar.getExecutor().execute("netstat", ["-anv"]).catch(() => null);
    if (!res?.success || !res.stdout) return [];

    const ports: ListeningPort[] = [];
    for (const line of res.stdout.split("\n")) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;

      const proto = cols[0].startsWith("tcp") ? "tcp" : cols[0].startsWith("udp") ? "udp" : null;
      if (!proto) continue;
      if (proto === "tcp" && !cols.includes("LISTEN")) continue;

      // BSD separates host and port with a dot, not a colon.
      const local = cols[3];
      const sep = local.lastIndexOf(".");
      if (sep < 0) continue;
      const port = Number(local.slice(sep + 1));
      if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;

      ports.push({ port, protocol: proto, address: local.slice(0, sep) || "*" });
    }
    return ports.sort((a, b) => a.port - b.port || a.address.localeCompare(b.address));
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "AllowPort", port, protocol });
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "DenyPort", port, protocol });
  }

  async flushRules(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("sentinel-darwin", { type: "FlushRules" });
  }
}
