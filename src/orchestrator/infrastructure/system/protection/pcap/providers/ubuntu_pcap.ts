import { PcapProvider } from "../pcap.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { CommandResult } from "@core/ports.ts";

/**
 * UbuntuPcapProvider
 * Achieves Full Dependency Hermeticity for packet capture via native sidecar.
 * Replaces legacy `tcpdump` shell-out with the Rust `pcap` agent's raw socket capture.
 */
export class UbuntuPcapProvider implements PcapProvider {
  constructor(private sidecar: SidecarManager) {}

  async startCapture(interfaceName: string, duration: number, filename: string, _filter?: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("netcap", {
      type: "StartCapture",
      interface: interfaceName,
      filename
    });
  }

  async stopCapture(_filename: string): Promise<CommandResult> {
    return await this.sidecar.sendCommand("netcap", {
      type: "StopCapture"
    });
  }

  async getStatus(): Promise<CommandResult> {
    return await this.sidecar.sendCommand("netcap", {
      type: "GetStatus"
    });
  }
}
