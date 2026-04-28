import { SystemExecutor } from "../../infrastructure/system_executor.ts";
import { VpnProvider, VpnResult } from "../interfaces.ts";

export class WindowsVpnProvider implements VpnProvider {
  constructor(private executor: SystemExecutor) {}
  async connect(interfaceName: string): Promise<VpnResult> {
    // Basic implementation using wireguard.exe /installservice
    // Note: Windows VPN management typically requires admin and specific config paths
    try {
        const result = await this.executor.execute("wireguard.exe", ["/installservice", interfaceName]);
        return {
            success: result.success,
            message: result.success ? `VPN Service installed/started for ${interfaceName}` : "Failed to start VPN service",
            details: result.stderr || result.stdout
        };
    } catch (e) {
        return { success: false, message: String(e) };
    }
  }

  async disconnect(): Promise<VpnResult> {
    // Basic implementation: /uninstallservice
    return { success: false, message: "Windows VPN disconnect via service uninstall not fully implemented for safety." };
  }

  async isConnected(): Promise<boolean> {
    const result = await this.executor.execute("powershell", ["-Command", "Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name"]);
    return result.stdout.includes("WireGuard");
  }

  async getStatus() {
    return await this.executor.execute("powershell", ["-Command", "Get-Service | Where-Object Name -like 'WireGuard*'"]);
  }
}
