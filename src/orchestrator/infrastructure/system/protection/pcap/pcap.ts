import { PcapProvider } from "../interfaces.ts";
import { PcapPort } from "@core/ports.ts";
export type { PcapProvider };

export class PcapManager implements PcapPort {
  constructor(private provider: PcapProvider) {}

  async startCapture(interface_name: string = "any", duration: number = 60, filename: string = `capture_${Date.now()}.pcap`, filter?: string) {
    return await this.provider.startCapture(interface_name, duration, filename, filter);
  }

  async stopCapture(filename: string) {
    return await this.provider.stopCapture(filename);
  }

  async getStatus() {
    return await this.provider.getStatus();
  }
}
