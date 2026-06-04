import { VpnProvider, VpnResult } from "../interfaces.ts";
export type { VpnProvider, VpnResult };

export class VpnManager {
  private eventBus?: any;
  private metricsInterval?: any;

  constructor(private provider: VpnProvider) {
    this.metricsInterval = setInterval(() => this.emitMetrics(), 30000);
  }

  shutdown() {
    if (this.metricsInterval) clearInterval(this.metricsInterval);
  }

  setEventBus(eventBus: any) {
    this.eventBus = eventBus;
  }

  private async emitMetrics() {
    if (!this.eventBus) return;
    await this.eventBus.emit("METRIC_UPDATE", {
      domain: "vpn",
      data: {
        active: await this.isConnected(),
        interface: "wg0", // simplified
        available: true
      }
    });
  }

  async connect(interfaceName: string = "wg0"): Promise<VpnResult> {
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
