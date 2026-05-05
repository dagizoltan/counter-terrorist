import { Plugin } from "../plugin_manager.ts";
import { VpnPort, LogSeverity, LogType } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";

export class VpnPlugin implements Plugin {
  name = "vpn";
  description = "Manages secure mesh communication and mTLS tunnels between defense nodes.";
  private active = false;

  constructor(private vpn: VpnPort) {}

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    this.active = true;
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "VPN-PLUGIN",
        message: "VPN service plugin started."
    });
  }

  async stop() {
    if (await this.vpn.isConnected()) {
      await this.vpn.disconnect();
    }
    this.active = false;
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "VPN-PLUGIN",
        message: "VPN service plugin stopped."
    });
  }

  async connect(interfaceName?: string) {
    return await this.vpn.connect(interfaceName || "wg0");
  }

  async disconnect() {
    return await this.vpn.disconnect();
  }
}
