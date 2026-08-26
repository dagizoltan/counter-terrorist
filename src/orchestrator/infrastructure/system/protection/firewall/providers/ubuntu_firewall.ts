import { FirewallProvider } from "../firewall.ts";
import { ListeningPort } from "../../interfaces.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult, LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { isAllowedSidecar } from "@infrastructure/system/validation.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  private async isSentinelActive(): Promise<boolean> {
    if (!isAllowedSidecar("sentinel") || !this.sidecar.isRunning("sentinel")) return false;

    // Check if Sentinel is in real BPF mode or fallback Dummy mode
    const status = await this.sidecar.sendCommand("sentinel", { type: "GET_STATUS" });
    return status.success && status.message === "Active";
  }

  private isSentinelAvailable(): boolean {
    return isAllowedSidecar("sentinel") && this.sidecar.isRunning("sentinel");
  }

  async blockIp(ip: string): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      const res = await this.sidecar.sendCommand("sentinel", { type: "BLOCK_IP", ip });
      if (res.success) return res;
    }
    // Fallback to UFW if Sentinel is unavailable or in Dummy mode
    return await this.executor.execute("ufw", ["deny", "from", ip]);
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: "orchestrator:infra:system:protection:firewall",
          message: `Shadow Banning IP: ${ip} via Native eBPF TC hooks.`
      });
      const res = await this.sidecar.sendCommand("sentinel", { type: "SHADOW_BAN", ip });
      if (res.success) return res;
    }
    
    // No native shadow ban in UFW, fallback to standard block
    return await this.blockIp(ip);
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      const res = await this.sidecar.sendCommand("sentinel", { type: "UNBLOCK_IP", ip });
      if (res.success) return res;
    }
    return await this.executor.execute("ufw", ["delete", "deny", "from", ip]);
  }

  async killProcess(pid: number): Promise<CommandResult> {
    // Prevent self-kill or PID 1 kill
    if (pid <= 1 || pid === Deno.pid) {
        return { success: false, stdout: "", stderr: "Security Violation: Cannot kill system critical process or orchestrator." };
    }
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "KillProcess", pid });
    }
    // Ensure arguments are strings and validated
    return await this.executor.execute("kill", ["-9", pid.toString()]);
  }

  async quarantineProcess(pid: number): Promise<CommandResult> {
    // Prevent self-quarantine or PID 1 quarantine
    if (pid <= 1 || pid === Deno.pid) {
        return { success: false, stdout: "", stderr: "Security Violation: Cannot quarantine system critical process or orchestrator." };
    }
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "QuarantineProcess", pid });
    }
    // SIGSTOP for quarantine
    // Use numeric signals for kill command consistency
    return await this.executor.execute("kill", ["-19", pid.toString()]);
  }

  async enforcePid(pid: number): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "ENFORCE_PID", pid });
    }
    return { success: false, stdout: "", stderr: "LSM Enforcement requires Sentinel (eBPF) sidecar." };
  }

  async unenforcePid(pid: number): Promise<CommandResult> {
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "UNENFORCE_PID", pid });
    }
    return { success: false, stdout: "", stderr: "LSM Enforcement requires Sentinel (eBPF) sidecar." };
  }

  async dumpProcessForensics(pid: number): Promise<CommandResult> {
    const dumpPath = `./volume/storage/forensics/forensics_process_${pid}_${Date.now()}.dump`;
    if (this.isSentinelAvailable()) {
      return await this.sidecar.sendCommand("sentinel", { type: "DumpProcess", pid, path: dumpPath });
    }
    // Fallback: gcore if available
    return await this.executor.execute("gcore", ["-o", dumpPath, pid.toString()]);
  }

  async getStatus(): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      return await this.sidecar.sendCommand("sentinel", { type: "GET_STATUS" });
    }
    return await this.executor.execute("ufw", ["status"]);
  }

  async lockdown(): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      const res = await this.sidecar.sendCommand("sentinel", { type: "LOCKDOWN" });
      if (res.success) return res;
    }
    return await this.executor.execute("ufw", ["default", "deny", "incoming"]);
  }
  
  /**
   * Parse `ss -tulnp` into structured listeners.
   *
   * Format, one socket per line after the header:
   *   tcp  LISTEN 0 4096  0.0.0.0:22   0.0.0.0:*  users:(("sshd",pid=812,fd=3))
   *
   * `ss` is already on the executor whitelist. The users:(...) column is only
   * present when the caller can see the owning process, so pid/process stay
   * optional rather than being guessed.
   */
  async listListeningPorts(): Promise<ListeningPort[]> {
    const res = await this.executor.execute("ss", ["-tulnpH"]).catch(() => null);
    if (!res?.success || !res.stdout) return [];

    const ports: ListeningPort[] = [];
    for (const line of res.stdout.split("\n")) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;

      const protocol = cols[0] === "udp" ? "udp" : cols[0] === "tcp" ? "tcp" : null;
      if (!protocol) continue;
      // UDP sockets report UNCONN rather than LISTEN, and both are listeners.
      if (protocol === "tcp" && cols[1] !== "LISTEN") continue;

      const local = cols[4];
      const sep = local.lastIndexOf(":");
      if (sep < 0) continue;
      const port = Number(local.slice(sep + 1));
      if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;

      const owner = /users:\(\("([^"]+)",pid=(\d+)/.exec(line);
      ports.push({
        port,
        protocol,
        address: local.slice(0, sep).replace(/^\[|\]$/g, "") || "*",
        ...(owner ? { process: owner[1], pid: Number(owner[2]) } : {}),
      });
    }

    // One row per listening socket; the same port on IPv4 and IPv6 is two.
    return ports.sort((a, b) => a.port - b.port || a.address.localeCompare(b.address));
  }

  async allowPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      const res = await this.sidecar.sendCommand("sentinel", { type: "ALLOW_PORT", port, protocol });
      if (res.success) return res;
    }
    return await this.executor.execute("ufw", ["allow", `${port}/${protocol}`]);
  }

  async denyPort(port: number, protocol: "tcp" | "udp"): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      const res = await this.sidecar.sendCommand("sentinel", { type: "DENY_PORT", port, protocol });
      if (res.success) return res;
    }
    return await this.executor.execute("ufw", ["deny", `${port}/${protocol}`]);
  }

  async flushRules(): Promise<CommandResult> {
    if (await this.isSentinelActive()) {
      const res = await this.sidecar.sendCommand("sentinel", { type: "FLUSH_RULES" });
      if (res.success) return res;
    }
    return await this.executor.execute("ufw", ["--force", "reset"]);
  }
}
