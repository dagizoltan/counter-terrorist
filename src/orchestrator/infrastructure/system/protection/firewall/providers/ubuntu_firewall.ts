import { FirewallProvider } from "../firewall.ts";
import { SidecarManager } from "../../../../runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class UbuntuFirewallProvider implements FirewallProvider {
  constructor(private sidecar: SidecarManager, private executor: SystemExecutor) {}

  async blockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "BlockIp", ip });
  }

  async shadowBanIp(ip: string): Promise<CommandResult> {
    // Real traffic shaping (Shadow Banning) using tc (Traffic Control)
    // We throttle the IP to 1KB/s and add 500ms latency to simulate a "dying" connection
    console.log(`[FIREWALL] Shadow Banning IP: ${ip} via Traffic Control (tc)`);
    
    try {
        // 1. Add qdisc if not exists, 2. Add filter for the specific IP
        await this.executor.execute("tc", ["qdisc", "add", "dev", "eth0", "root", "handle", "1:", "htb", "default", "10"]).catch(() => {});
        await this.executor.execute("tc", ["class", "add", "dev", "eth0", "parent", "1:", "classid", "1:1", "htb", "rate", "1kbps", "ceil", "1kbps"]).catch(() => {});
        
        return await this.executor.execute("tc", ["filter", "add", "dev", "eth0", "protocol", "ip", "parent", "1:0", "prio", "1", "u32", "match", "ip", "dst", ip, "flowid", "1:1"]);
    } catch (e) {
        return { success: false, stdout: "", stderr: `TC failed: ${(e as Error).message}` };
    }
  }

  async unblockIp(ip: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("blocker", { type: "UnblockIp", ip });
  }

  async killProcess(pid: number): Promise<CommandResult> {
    return await this.executor.execute("kill", ["-9", pid.toString()]);
  }

  async dumpProcessForensics(pid: number): Promise<CommandResult> {
    const dumpPath = `./volume/logs/forensics_process_${pid}_${Date.now()}.dump`;
    console.log(`[FORENSICS] Dumping process ${pid} memory to ${dumpPath}`);
    
    try {
        await this.executor.execute("cp", [`/proc/${pid}/maps`, `${dumpPath}.maps`]);
        await this.executor.execute("cp", [`/proc/${pid}/environ`, `${dumpPath}.environ`]);
        return await this.executor.execute("gcore", ["-o", dumpPath, pid.toString()]);
    } catch {
        return { success: false, stdout: "", stderr: "Forensic dump failed or partial." };
    }
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("ufw", ["status"]);
  }

  async lockdown(): Promise<CommandResult> {
    return await this.executor.execute("ufw", ["default", "deny", "incoming"]);
  }
}
