import { VpnProvider, VpnResult } from "../vpn.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class UbuntuVpnProvider implements VpnProvider {
  constructor(private executor: SystemExecutor) {}

  async connect(interfaceName: string): Promise<VpnResult> {
    const res = await this.executor.execute("wg-quick", ["up", interfaceName]);
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async disconnect(): Promise<VpnResult> {
    const res = await this.executor.execute("wg-quick", ["down", "wg0"]);
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async isConnected(): Promise<boolean> {
    const res = await this.executor.execute("wg", ["show", "wg0"]);
    return res.success;
  }

  async getStatus(): Promise<any> {
    return await this.executor.execute("wg", ["show"]);
  }
}
