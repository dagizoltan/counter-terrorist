import { VpnProvider, VpnResult } from "../vpn.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

/**
 * UbuntuVpnProvider
 * Achieves Full Dependency Hermeticity for VPN management via native sidecar.
 */
export class UbuntuVpnProvider implements VpnProvider {
  constructor(private sidecar: SidecarManager) {}

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("vpn", { type: "Connect", interface: interfaceName });
    return { success: res.success, message: res.message };
  }

  async disconnect(interfaceName: string = "wg0"): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("vpn", { type: "Disconnect", interface: interfaceName });
    return { success: res.success, message: res.message };
  }

  async isConnected(interfaceName: string = "wg0"): Promise<boolean> {
    const res = await this.sidecar.sendCommand("vpn", { type: "GetStatus" });
    return res.success && res.data?.active_interfaces?.includes(interfaceName);
  }

  async getStatus(): Promise<any> {
    const res = await this.sidecar.sendCommand("vpn", { type: "GetStatus" });
    return res.data;
  }

  async flushRules(): Promise<VpnResult> {
    return { success: true, message: "Hermetic: No legacy rules to flush." };
  }
}
