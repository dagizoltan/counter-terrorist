import { commandManager } from "../command_manager.ts";
import { firewall } from "./firewall.ts";

export interface VpnResult {
    success: boolean;
    message: string;
    details?: string;
}

export class VpnManager {
  private activeInterface: string | null = null;
  private currentEndpoints: Array<{ip: string, port: string}> = [];

  async getEndpoints(interfaceName: string): Promise<Array<{ip: string, port: string}>> {
    const result = await commandManager.execute("wg", ["show", interfaceName, "endpoints"]);
    if (!result.success) return [];

    const endpoints = [];
    // Output format: <public key>\t<ip>:<port>
    const lines = result.stdout.trim().split("\n");
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const endpointStr = parts[1];
            // Skip if it says "(none)"
            if (endpointStr === "(none)") continue;

            // Handle IPv6 brackets if present, e.g. [2001:db8::1]:51820
            const lastColonIdx = endpointStr.lastIndexOf(":");
            if (lastColonIdx > 0) {
                let ip = endpointStr.substring(0, lastColonIdx);
                const port = endpointStr.substring(lastColonIdx + 1);

                // Remove brackets for IPv6 for ufw if necessary, ufw handles standard format
                if (ip.startsWith("[") && ip.endsWith("]")) {
                    ip = ip.substring(1, ip.length - 1);
                }

                endpoints.push({ ip, port });
            }
        }
    }
    return endpoints;
  }

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
            this.currentEndpoints = await this.getEndpoints(interfaceName);

            await firewall.enableKillSwitch(interfaceName, this.currentEndpoints);
            return { success: true, message: `Connected to ${interfaceName} (Kill-Switch Active)` };
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
            await firewall.disableKillSwitch(this.activeInterface, this.currentEndpoints);
            const iface = this.activeInterface;
            this.activeInterface = null;
            this.currentEndpoints = [];
            return { success: true, message: `Disconnected from ${iface} (Kill-Switch Disabled)` };
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

  startMonitor(intervalMs: number = 10000) {
    console.log(`[VPN] Starting active health monitoring loop (Interval: ${intervalMs}ms)`);
    setInterval(async () => {
      if (!this.activeInterface) return;

      const isConnected = await this.isConnected();
      if (!isConnected) {
        console.error(`[VPN] CRITICAL: VPN connection lost on ${this.activeInterface}! Attempting reconnect...`);

        // Attempt reconnect
        const result = await this.connect(this.activeInterface);
        if (result.success) {
          console.log(`[VPN] Successfully reconnected to ${this.activeInterface}`);
        } else {
          console.error(`[VPN] Failed to reconnect: ${result.message}`);
        }
      }
    }, intervalMs);
  }
}

export const vpn = new VpnManager();
