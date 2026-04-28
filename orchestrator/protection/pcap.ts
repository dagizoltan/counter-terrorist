import { CommandManager } from "../services/command_manager.ts";

export class PcapManager {
  constructor(private commandManager: CommandManager) {}

  async startCapture(interface_name: string = "any", duration: number = 60, filename: string = `capture_${Date.now()}.pcap`) {
    console.log(`[PCAP] Requesting capture on ${interface_name} for ${duration}s...`);
    try {
      const result = await this.commandManager.sendCommand("pcap", {
        type: "StartCapture",
        payload: { interface: interface_name, duration, filename }
      });
      return result;
    } catch (error) {
      console.error("[PCAP] Error starting capture:", error);
      return { success: false, message: String(error) };
    }
  }

  async stopCapture() {
    try {
      const result = await this.commandManager.sendCommand("pcap", {
        type: "StopCapture"
      });
      return result;
    } catch (error) {
      console.error("[PCAP] Error stopping capture:", error);
      return { success: false, message: String(error) };
    }
  }
}

