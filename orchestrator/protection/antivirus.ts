import { commandManager } from "../command_manager.ts";
import { resolve, normalize } from "https://deno.land/std@0.224.0/path/mod.ts";

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
    // Canonicalize path to prevent traversal (Milestone 1 requirement)
    const absolutePath = resolve(normalize(path));

    const allowedPrefixes = ["/tmp", "/var/tmp"];
    const home = Deno.env.get("HOME");
    if (home) {
      allowedPrefixes.push(resolve(home, "Downloads"));
    }

    const isAllowed = allowedPrefixes.some((prefix) => absolutePath.startsWith(prefix));

    if (!isAllowed) {
      return {
        success: false,
        stdout: "",
        stderr: `Path '${path}' is not in the allowed scan list (/tmp, /var/tmp, ~/Downloads)`,
      };
    }

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
