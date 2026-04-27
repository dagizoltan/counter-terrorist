import { commandManager } from "../command_manager.ts";
import { firewall } from "./firewall.ts";
import { broadcast } from "../api/ws.ts";

export class VpnManager {
  private activeInterface: string | null = null;
  private vpnServerIp: string | null = null;
  private monitoringInterval: number | null = null;
  private killSwitchEnabled: boolean = false;

  async connect(interfaceName: string = "wg0", serverIp?: string) {
    console.log(`[VPN] Attempting to connect to interface: ${interfaceName}`);

    // In a real scenario, we might extract the server IP from the WireGuard config
    // For this milestone, we allow it to be passed or we use a placeholder if not provided
    this.vpnServerIp = serverIp || "1.1.1.1"; // Placeholder

    const result = await commandManager.execute("wg-quick", ["up", interfaceName]);
    if (result.success) {
      this.activeInterface = interfaceName;
      broadcast({ type: "VPN_CONNECTED", message: `VPN connected on ${interfaceName}` });

      if (this.killSwitchEnabled) {
        await this.enableKillSwitch(this.vpnServerIp, interfaceName);
      }
    }
    return result;
  }

  async disconnect() {
    if (!this.activeInterface) return { success: true, message: "No active VPN" };

    if (this.killSwitchEnabled) {
      await this.disableKillSwitch();
    }

    const result = await commandManager.execute("wg-quick", ["down", this.activeInterface]);
    if (result.success) {
      broadcast({ type: "VPN_DISCONNECTED", message: `VPN disconnected from ${this.activeInterface}` });
      this.activeInterface = null;
    }
    return result;
  }

  async isConnected(): Promise<boolean> {
    const result = await commandManager.execute("wg", ["show"]);
    return result.success && result.stdout.length > 0;
  }

  async enableKillSwitch(serverIp: string, interfaceName: string) {
    this.killSwitchEnabled = true;
    this.vpnServerIp = serverIp;
    this.activeInterface = interfaceName;
    return await firewall.enableKillSwitch(serverIp, interfaceName);
  }

  async disableKillSwitch() {
    this.killSwitchEnabled = false;
    return await firewall.disableKillSwitch();
  }

  startMonitoring(intervalMs: number = 10000) {
    if (this.monitoringInterval) return;

    console.log(`[VPN] Starting health monitoring loop (${intervalMs}ms)`);
    this.monitoringInterval = setInterval(async () => {
      const connected = await this.isConnected();
      if (!connected && this.activeInterface) {
        console.warn(`[VPN] Health check failed! VPN interface ${this.activeInterface} is down.`);
        broadcast({ type: "VPN_CRITICAL", message: `VPN connection lost on ${this.activeInterface}!` });

        if (this.killSwitchEnabled) {
          console.log("[VPN] Kill-switch is active. Network traffic is blocked.");
        } else {
          console.log("[VPN] Kill-switch not active. System may be leaking traffic!");
        }
      }
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

export const vpn = new VpnManager();
