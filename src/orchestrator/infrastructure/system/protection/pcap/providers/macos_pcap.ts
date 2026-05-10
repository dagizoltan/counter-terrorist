import { PcapProvider } from "../pcap.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class MacosPcapProvider implements PcapProvider {
  constructor(private executor: SystemExecutor) {}

  async startCapture(interface_name: string = "any", duration: number = 60, filename: string = "capture.pcap", filter: string = ""): Promise<CommandResult> {
    const args = ["-i", interface_name, "-G", duration.toString(), "-W", "1", "-w", `./volume/storage/captures/${filename}`];
    if (filter) args.push(filter);
    return await this.executor.execute("tcpdump", args);
  }

  async stopCapture(): Promise<CommandResult> {
    return await this.executor.execute("killall", ["tcpdump"]);
  }

  async getStatus(): Promise<CommandResult> {
    return await this.executor.execute("pgrep", ["tcpdump"]);
  }
}
