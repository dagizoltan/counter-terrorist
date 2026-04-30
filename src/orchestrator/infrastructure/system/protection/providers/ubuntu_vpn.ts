import { SystemExecutor } from "../../system_executor.ts";
import { VpnProvider, VpnResult } from "../interfaces.ts";

export class UbuntuVpnProvider implements VpnProvider {
  constructor(private executor: SystemExecutor) {}
  private activeInterface: string | null = null;

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
    // Validate interface name to prevent command/argument injection
    // wg-quick(8) recommended names: [a-zA-Z0-9_=+.-]{1,15}
    const interfaceRegex = /^[a-zA-Z0-9_=+.-]{1,15}$/;
    if (!interfaceRegex.test(interfaceName) || interfaceName.startsWith("-")) {
      return { success: false, message: `Invalid interface name: ${interfaceName}` };
    }

    const checkResult = await this.executor.execute("which", ["wg-quick"]);
    if (!checkResult.success) {
        return { success: false, message: "WireGuard (wg-quick) is not installed." };
    }

    try {
        const result = await this.executor.execute("wg-quick", ["up", interfaceName]);
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
        const connected = await this.isConnected();
        if (!connected) return { success: true, message: "No active VPN detected" };
        return { success: false, message: "VPN is active but interface is unknown." };
    }

    try {
        const result = await this.executor.execute("wg-quick", ["down", this.activeInterface]);
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
        const result = await this.executor.execute("wg", ["show"]);
        return result.success && result.stdout.trim().length > 0;
    } catch {
        return false;
    }
  }

  async getStatus() {
    const result = await this.executor.execute("wg", ["show"]);
    return {
        connected: result.success && result.stdout.trim().length > 0,
        output: result.stdout,
        error: result.stderr
    };
  }
}
