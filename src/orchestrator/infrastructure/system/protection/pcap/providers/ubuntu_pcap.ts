import { PcapProvider } from "../pcap.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

export class UbuntuPcapProvider implements PcapProvider {
  private activeCaptures: Map<string, Deno.ChildProcess> = new Map();

  constructor(private executor: SystemExecutor) {}

  async startCapture(interfaceName: string, duration: number, filename: string, filter?: string): Promise<CommandResult> {
    const args = [
      "-i", interfaceName,
      "-w", `/tmp/${filename}`,
      "-G", duration.toString(),
      "-W", "1"
    ];

    if (filter) {
      args.push(filter);
    }

    try {
      const command = new Deno.Command("tcpdump", {
        args,
        stdout: "piped",
        stderr: "piped",
      });
      
      const child = command.spawn();
      this.activeCaptures.set(filename, child);
      
      return { success: true, stdout: `Started capture on ${interfaceName} -> ${filename}`, stderr: "" };
    } catch (e) {
      return { success: false, stdout: "", stderr: (e as Error).message };
    }
  }

  async stopCapture(filename: string): Promise<CommandResult> {
    const child = this.activeCaptures.get(filename);
    if (child) {
      try {
        child.kill();
        this.activeCaptures.delete(filename);
        return { success: true, stdout: `Stopped capture: ${filename}`, stderr: "" };
      } catch (e) {
        return { success: false, stdout: "", stderr: (e as Error).message };
      }
    }
    return { success: false, stdout: "", stderr: "Capture not found" };
  }

  async getStatus(): Promise<CommandResult> {
    return { success: true, stdout: `Active captures: ${this.activeCaptures.size}`, stderr: "" };
  }
}
