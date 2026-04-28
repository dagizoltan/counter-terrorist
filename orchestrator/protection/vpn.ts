import { VpnProvider, VpnResult } from "./interfaces.ts";
import { UbuntuVpnProvider } from "./ubuntu_vpn.ts";

export class VpnManager {
  private provider: VpnProvider;

  constructor() {
    this.provider = new UbuntuVpnProvider();
  }

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
    console.log(`[VPN] Attempting to connect to: ${interfaceName}`);
    return await this.provider.connect(interfaceName);
  }

  async disconnect(): Promise<VpnResult> {
    return await this.provider.disconnect();
  }

  async isConnected(): Promise<boolean> {
    return await this.provider.isConnected();
  }

  async getStatus() {
    return await this.provider.getStatus();
  }
}

export const vpn = new VpnManager();
