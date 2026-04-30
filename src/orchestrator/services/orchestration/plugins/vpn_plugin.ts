import { Plugin } from "../plugin_manager.ts";
import { VpnPort } from "@core/ports.ts";

export class VpnPlugin implements Plugin {
  name = "vpn";
  private active = false;

  constructor(private vpn: VpnPort) {}

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    this.active = true;
    console.log("[VPN-PLUGIN] VPN service plugin started.");
  }

  async stop() {
    if (await this.vpn.isConnected()) {
      await this.vpn.disconnect();
    }
    this.active = false;
    console.log("[VPN-PLUGIN] VPN service plugin stopped.");
  }

  async connect(interfaceName?: string) {
    return await this.vpn.connect(interfaceName || "wg0");
  }

  async disconnect() {
    return await this.vpn.disconnect();
  }
}
