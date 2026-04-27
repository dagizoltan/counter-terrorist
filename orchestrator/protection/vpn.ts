import { commandManager } from "../command_manager.ts";

export interface VpnResult {
    success: boolean;
    message: string;
    details?: string;
}

export class VpnManager {
  private activeInterface: string | null = null;

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
    console.log(`[VPN] Attempting to connect to interface: ${interfaceName}`);

    // Check if wg-quick is available
    const checkResult = await commandManager.execute("which", ["wg-quick"]);
    if (!checkResult.success) {
        return { success: false, message: "WireGuard (wg-quick) is not installed on this system." };
    }

    try {
        const result = await commandManager.execute("wg-quick", ["up", interfaceName]);
        if (result.success) {
            this.activeInterface = interfaceName;
            return { success: true, message: `Connected to ${interfaceName}` };
        } else {
            return {
                success: false,
                message: `Failed to connect to ${interfaceName}`,
                details: result.stderr || result.stdout
            };
        }
    } catch (e) {
        return { success: false, message: "Unexpected error during VPN connection", details: String(e) };
    }
  }

  async disconnect(): Promise<VpnResult> {
    if (!this.activeInterface) {
        // Double check if any wg interface is up even if we don't think so
        const connected = await this.isConnected();
        if (!connected) return { success: true, message: "No active VPN detected" };

        // If connected but we don't know the interface, we might need a more aggressive disconnect or user intervention
        return { success: false, message: "VPN is active but interface is unknown to orchestrator." };
    }

    try {
        const result = await commandManager.execute("wg-quick", ["down", this.activeInterface]);
        if (result.success) {
            const iface = this.activeInterface;
            this.activeInterface = null;
            return { success: true, message: `Disconnected from ${iface}` };
        } else {
            return {
                success: false,
                message: `Failed to disconnect from ${this.activeInterface}`,
                details: result.stderr || result.stdout
            };
        }
    } catch (e) {
        return { success: false, message: "Unexpected error during VPN disconnection", details: String(e) };
    }
  }

  async isConnected(): Promise<boolean> {
    try {
        const result = await commandManager.execute("wg", ["show"]);
        return result.success && result.stdout.trim().length > 0;
    } catch {
        return false;
    }
  }

  async getStatus() {
    const result = await commandManager.execute("wg", ["show"]);
    return {
        connected: result.success && result.stdout.trim().length > 0,
        output: result.stdout,
        error: result.stderr
    };
  }
}

export const vpn = new VpnManager();
