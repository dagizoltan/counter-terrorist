import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";

export interface RkhunterResult {
  success: boolean;
  output: string;
  summary?: {
    totalChecks: number;
    suspiciousFiles: number;
    possibleRootkits: number;
  };
}

export class RkhunterManager {
  async runCheck(): Promise<RkhunterResult> {
    console.log("[RKHUNTER] Starting rootkit check via scanner sidecar...");
    const command = { type: "RunRkhunter" };
    const result = await commandManager.sendCommand("scanner", JSON.stringify(command));

    if (result.type === "RkhunterResult") {
      const payload = result.payload;
      const parsed = this.parseOutput(payload.output);

      if (parsed.suspiciousFiles > 0 || parsed.possibleRootkits > 0) {
        broadcast({
          type: "RKHUNTER_ALERT",
          message: `Rootkit scan found ${parsed.possibleRootkits} possible rootkits and ${parsed.suspiciousFiles} suspicious files!`
        });
      }

      return {
        success: payload.success,
        output: payload.output,
        summary: parsed
      };
    } else if (result.type === "Error") {
      return { success: false, output: result.payload };
    }

    return { success: false, output: "Unexpected response from scanner" };
  }

  private parseOutput(output: string) {
    const summary = {
      totalChecks: 0,
      suspiciousFiles: 0,
      possibleRootkits: 0
    };

    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("File properties checks...")) {
          // Total checks heuristic
      }
      if (line.includes("Possible rootkits:")) {
          const match = line.match(/\d+/);
          if (match) summary.possibleRootkits = parseInt(match[0]);
      }
      if (line.includes("Suspicious files:")) {
          const match = line.match(/\d+/);
          if (match) summary.suspiciousFiles = parseInt(match[0]);
      }
    }

    return summary;
  }
}

export const rkhunter = new RkhunterManager();
