import { VpnProvider, VpnResult } from "../vpn.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class WindowsVpnProvider implements VpnProvider {
  constructor(private executor: SystemExecutor) {}

  async connect(interfaceName: string): Promise<VpnResult> {
    const res = await this.executor.execute("powershell", ["-Command", `Connect-VpnConnection -Name '${interfaceName}'`]);
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async disconnect(): Promise<VpnResult> {
    const res = await this.executor.execute("powershell", ["-Command", "Disconnect-VpnConnection -Name 'MeshVPN'"]);
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async isConnected(): Promise<boolean> {
    const res = await this.executor.execute("powershell", ["-Command", "Get-VpnConnection -Name 'MeshVPN'"]);
    return res.success;
  }

  async getStatus(): Promise<any> {
    return await this.executor.execute("powershell", ["-Command", "Get-VpnConnection"]);
  }
}
