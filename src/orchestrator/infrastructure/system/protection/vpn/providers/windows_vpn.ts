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

  async disconnect(): Promise<VpnResult> {
    const res = await this.sidecar.sendCommand("tunnel", {
        type: "DISCONNECT",
        payload: { interface: "MeshVPN" }
    });
    return { success: res.success, message: res.stdout + res.stderr };
  }

  async isConnected(): Promise<boolean> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "GET_STATUS" });
    return res.success && res.data?.active === true;
  }

  async getStatus(): Promise<any> {
    const res = await this.sidecar.sendCommand("tunnel", { type: "GET_STATUS" });
    return res.data;
  }

  async flushRules(): Promise<VpnResult> {
    return { success: true, message: "No dynamic VPN rules to flush on Windows" };
  }
}
