import { commandManager } from "../command_manager.ts";

export class VpnManager {
  private activeInterface: string | null = null;

  async connect(interfaceName: string = "wg0") {
    console.log(`[VPN] Attempting to connect to interface: ${interfaceName}`);
    // Using wg-quick for WireGuard as a primary example
    const result = await commandManager.execute("wg-quick", ["up", interfaceName]);
    if (result.success) {
      this.activeInterface = interfaceName;
    }
    return result;
  }

  async disconnect() {
    if (!this.activeInterface) return { success: true, message: "No active VPN" };
    const result = await commandManager.execute("wg-quick", ["down", this.activeInterface]);
    if (result.success) {
      this.activeInterface = null;
    }
    return result;
  }

  async isConnected(): Promise<boolean> {
    const result = await commandManager.execute("wg", ["show"]);
    return result.success && result.stdout.length > 0;
  }
}

export const vpn = new VpnManager();
