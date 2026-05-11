import { PcapProvider } from "../pcap.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { CommandResult } from "@core/ports.ts";

/**
 * MacosPcapProvider
 * Achieves Full Dependency Hermeticity for packet capture via native sidecar.
 * Replaces legacy `tcpdump` shell-out with the Rust `pcap` agent's raw socket capture.
 */
export class MacosPcapProvider implements PcapProvider {
  constructor(private sidecar: SidecarManager) {}

  async startCapture(interfaceName: string = "any", _duration: number = 60, filename: string = "capture.pcap", _filter?: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("pcap", {
      type: "StartCapture",
      interface: interfaceName,
      filename
    });
  }

  async stopCapture(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("pcap", {
      type: "StopCapture"
    });
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("pcap", {
      type: "GetStatus"
    });
  }
}
