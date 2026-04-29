import { SidecarManager } from "../infrastructure/sidecar_manager.ts";

/**
 * Manager for PCAP (Packet Capture) operations via the 'pcap' sidecar.
 */
export class PcapManager {
  constructor(private sidecar: SidecarManager) {}

  /**
   * Starts a packet capture on the specified interface.
   *
   * @param interface_name The network interface to capture on (default: "any")
   * @param duration The duration of the capture in seconds (default: 60)
   * @param filename The name of the output .pcap file
   */
  async startCapture(interface_name: string = "any", duration: number = 60, filename: string = `capture_${Date.now()}.pcap`) {
    try {
      const result = await this.sidecar.sendCommand("pcap", {
        type: "StartCapture",
        payload: { interface: interface_name, duration, filename }
      });
      return result;
    } catch (error) {
      console.error("[PCAP] Error starting capture:", error);
      return { success: false, message: String(error) };
    }
  }

  /**
   * Stops the current packet capture.
   */
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
