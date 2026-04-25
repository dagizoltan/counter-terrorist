import { commandManager } from "../command_manager.ts";

export class AntivirusManager {
  async getStatus() {
    const os = Deno.build.os;
    if (os === "windows") {
      // Query Windows Defender status via PowerShell
      return await commandManager.execute("powershell", [
        "-Command",
        "Get-MpComputerStatus | Select-Object -Property AMServiceEnabled, AntispywareEnabled, RealTimeProtectionEnabled | ConvertTo-Json"
      ]);
    } else if (os === "linux") {
      // Check for ClamAV service
      return await commandManager.execute("systemctl", ["is-active", "clamav-daemon"]);
    }
    return { success: false, stdout: "", stderr: "AV check not implemented for this OS" };
  }

  async scanPath(path: string) {
    const os = Deno.build.os;
    if (os === "linux") {
      return await commandManager.execute("clamscan", ["-r", path]);
    } else if (os === "windows") {
      return await commandManager.execute("powershell", ["-Command", `Start-MpScan -ScanType CustomScan -ScanPath "${path}"`]);
    }
    return { success: false, stdout: "", stderr: "Manual scan not implemented for this OS" };
  }
}

export const antivirus = new AntivirusManager();
