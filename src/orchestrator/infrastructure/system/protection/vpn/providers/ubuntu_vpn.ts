import { VpnProvider, VpnResult } from "../vpn.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

/**
 * UbuntuVpnProvider
 * Achieves Full Dependency Hermeticity for VPN management via native sidecar.
 */
export class UbuntuVpnProvider implements VpnProvider {
  constructor(private sidecar: SidecarManager) {}

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "CONNECT", payload: { interface: interfaceName } });
    return { success: res.success, message: res.stdout || res.stderr || "" };
  }

  async disconnect(interfaceName: string = "wg0"): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "DISCONNECT", payload: { interface: interfaceName } });
    return { success: res.success, message: res.stdout || res.stderr || "" };
  }

  async isConnected(interfaceName: string = "wg0"): Promise<boolean> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "GET_STATUS", payload: {} });
    return res.success && (res.data?.active === true || res.data?.active_interfaces?.includes(interfaceName));
  }

  async getStatus(): Promise<unknown> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "GET_STATUS", payload: {} });
    return res.data;
  }

  flushRules(): Promise<VpnResult> {
    return Promise.resolve({ success: true, message: "Hermetic: No legacy rules to flush." });
  }
}
