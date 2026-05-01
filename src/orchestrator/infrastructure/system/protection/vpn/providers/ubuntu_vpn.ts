import { VpnProvider, VpnResult } from "../vpn.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class UbuntuVpnProvider implements VpnProvider {
  constructor(private executor: SystemExecutor) {}

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
    const res = await this.executor.execute("wg-quick", ["up", interfaceName]);
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async disconnect(interfaceName: string = "wg0"): Promise<VpnResult> {
    const res = await this.executor.execute("wg-quick", ["down", interfaceName]);
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async isConnected(interfaceName: string = "wg0"): Promise<boolean> {
    const res = await this.executor.execute("wg", ["show", interfaceName]);
    return res.success;
  }

  async getStatus(): Promise<any> {
    return await this.executor.execute("wg", ["show"]);
  }
}
