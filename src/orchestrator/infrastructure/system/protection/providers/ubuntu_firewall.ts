import { CommandResult } from "@core/ports.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "../../system_executor.ts";
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

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Send to eBPF sidecar via persistent stdin (sendCommand)
    return await (this.sidecar as any).sendCommand("ebpf", { type: "SHADOW_BAN", ip });
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

  async lockdown(): Promise<CommandResult> {
    // 1. Allow critical ports first
    await this.executor.execute("sudo", ["ufw", "allow", "8000/tcp"]);
    await this.executor.execute("sudo", ["ufw", "allow", "22/tcp"]);
    
    // 2. Set default deny
    await this.executor.execute("sudo", ["ufw", "default", "deny", "incoming"]);
    await this.executor.execute("sudo", ["ufw", "default", "deny", "outgoing"]);
    
    // 3. Allow essential outgoing
    await this.executor.execute("sudo", ["ufw", "allow", "out", "8000/tcp"]);
    await this.executor.execute("sudo", ["ufw", "allow", "out", "53"]);
    
    const res = await this.executor.execute("sudo", ["ufw", "enable", "--force"]);
    return { success: res.success, stdout: "Emergency Lockdown Engaged", stderr: res.stderr };
  }
}
