import { PcapProvider } from "../pcap.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class WindowsPcapProvider implements PcapProvider {
  constructor(private executor: SystemExecutor) {}

  async startCapture(interface_name: string = "any", duration: number = 60, filename: string = "capture.pcap", filter: string = ""): Promise<CommandResult> {
    // Windows usually uses 'pktmon' for native capture
    const args = ["start", "--etw", "-p", `./volume/storage/captures/${filename}`];
    if (filter) {
        // pktmon filter logic would go here
    }
    return await this.executor.execute("pktmon", args);
  }

  async stopCapture(): Promise<CommandResult> {
    return await this.executor.execute("pktmon", ["stop"]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("pktmon", ["status"]);
  }
}
