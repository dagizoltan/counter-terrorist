import { VpnProvider, VpnResult } from "../vpn.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

export class WindowsVpnProvider implements VpnProvider {
  constructor(private sidecar: SidecarManager) {}

  async connect(interfaceName: string): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("tunnel", {
        type: "CONNECT",
        payload: { interface: interfaceName }
    });
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async disconnect(interfaceName: string = "MeshVPN"): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("tunnel", {
        type: "DISCONNECT",
        payload: { interface: interfaceName }
    });
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async isConnected(interfaceName?: string): Promise<boolean> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "GET_STATUS" });
    if (!res.success) return false;
    if (interfaceName) {
        return res.data?.active === true || res.data?.active_interfaces?.includes(interfaceName);
    }
    return res.data?.active === true;
  }

  async getStatus(): Promise<unknown> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "GET_STATUS" });
    return res.data;
  }

  flushRules(): Promise<VpnResult> {
    return Promise.resolve({ success: true, message: "No dynamic VPN rules to flush on Windows" });
  }
}
