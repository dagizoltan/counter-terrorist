import { SidecarManager } from "../infrastructure/sidecar_manager.ts";

export class PcapManager {
  constructor(private sidecar: SidecarManager) {}

  async startCapture(interface_name: string = "any", duration: number = 60, filename: string = `capture_${Date.now()}.pcap`, filter?: string) {
    try {
      const result = await this.sidecar.sendCommand("pcap", {
        type: "StartCapture",
        payload: { interface: interface_name, duration, filename, filter }
      });
      return result;
    } catch (error) {
      console.error("[PCAP] Error starting capture:", error);
      return { success: false, message: String(error) };
    }
  }

  async stopCapture() {
    try {
      const result = await this.sidecar.sendCommand("pcap", {
        type: "StopCapture"
      });
      return result;
    } catch (error) {
      console.error("[PCAP] Error stopping capture:", error);
      return { success: false, message: String(error) };
    }
  }
}

