import { VpnProvider } from "../vpn.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class MacosVpnProvider implements VpnProvider {
  constructor(private executor: SystemExecutor) {}

  async connect(interfaceName: string): Promise<{ success: boolean; message: string; details?: string }> {
    const res = await this.executor.execute("sudo", ["wg-quick", "up", interfaceName]);
    return { success: res.success, message: res.success ? "VPN Connected" : "VPN Failed", details: res.stderr };
  }

  async disconnect(): Promise<{ success: boolean; message: string; details?: string }> {
    const res = await this.executor.execute("sudo", ["wg-quick", "down", "all"]);
    return { success: res.success, message: res.success ? "VPN Disconnected" : "VPN Failed", details: res.stderr };
  }

  async isConnected(): Promise<boolean> {
    const res = await this.executor.execute("ifconfig", ["wg0"]);
    return res.success;
  }

  async getStatus(): Promise<any> {
    const res = await this.executor.execute("wg", ["show"]);
    return res.stdout;
  }
}
