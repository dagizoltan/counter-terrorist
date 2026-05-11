import { PcapProvider } from "../pcap.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { CommandResult } from "@core/ports.ts";

export class UbuntuPcapProvider implements PcapProvider {
  constructor(private sidecar: SidecarManager) {}

  async startCapture(interfaceName: string, _duration: number, filename: string, _filter?: string): Promise<CommandResult> {
    // Transitioning from tcpdump to native Rust PCAP agent
    return await this.sidecar.sendCommand("pcap", {
      type: "StartCapture",
      payload: {
        interface: interfaceName,
        filename: `./volume/storage/captures/${filename}`
      }
    });
  }

  async stopCapture(_filename: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("pcap", { type: "StopCapture" });
  }

  async getStatus(): Promise<CommandResult> {
    return { success: true, stdout: `Active captures: ${this.activeCaptures.size}`, stderr: "" };
  }
}
