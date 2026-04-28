import { VpnProvider, VpnResult } from "./interfaces.ts";
import { UbuntuVpnProvider } from "./ubuntu_vpn.ts";
import { WindowsVpnProvider } from "./windows_vpn.ts";

export class VpnManager {
  private provider: VpnProvider;

  constructor() {
    const os = Deno.build.os;
    if (os === "windows") {
        this.provider = new WindowsVpnProvider();
    } else {
        this.provider = new UbuntuVpnProvider();
    }
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
