import { commandManager } from "../command_manager.ts";
import { resolve, normalize } from "https://deno.land/std@0.224.0/path/mod.ts";
import { loggingService } from "../services/logging.ts";

export interface ScanResult {
    success: boolean;
    threatsFound: boolean;
    message: string;
    details?: string;
}

export class AntivirusManager {
  async getStatus() {
    const os = Deno.build.os;
    try {
        if (os === "windows") {
            return await commandManager.execute("powershell", [
                "-Command",
                "Get-MpComputerStatus | Select-Object -Property AMServiceEnabled, AntispywareEnabled, RealTimeProtectionEnabled | ConvertTo-Json"
            ]);
        } else if (os === "linux") {
            const result = await commandManager.execute("systemctl", ["is-active", "clamav-daemon"]);
            return {
                success: result.success,
                active: result.stdout.trim() === "active",
                details: result.stdout.trim()
            };
        }
    } catch (e) {
        return { success: false, error: String(e) };
    }
    return { success: false, stdout: "", stderr: "AV check not implemented for this OS" };
  }

  async scanPath(path: string): Promise<ScanResult> {
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
        threatsFound: false,
        message: `Path '${path}' is not in the allowed scan list (/tmp, /var/tmp, ~/Downloads)`,
      };
    }

    const os = Deno.build.os;
    try {
        if (os === "linux") {
            // Check if clamscan is installed
            const check = await commandManager.execute("which", ["clamscan"]);
            if (!check.success) {
                return { success: false, threatsFound: false, message: "clamscan is not installed." };
            }

            const result = await commandManager.execute("clamscan", ["-r", absolutePath]);
            // Clamscan exit codes: 0 = no virus, 1 = virus found, 2 = error
            const threatsFound = result.stdout.includes("Infected files: 1") || !result.success && result.stdout.includes("Infected files:");

            if (threatsFound) {
                loggingService.logSecurityEvent({
                    level: "CRITICAL",
                    source: "AntivirusManager",
                    type: "THREAT_DETECTED",
                    message: `Virus detected in path: ${absolutePath}`,
                    details: { path: absolutePath, output: result.stdout }
                });
            }

            return {
                success: result.success || result.stdout.includes("Infected files:"),
                threatsFound: threatsFound,
                message: result.success ? "Scan completed successfully." : "Scan detected issues or failed.",
                details: result.stdout
            };
        } else if (os === "windows") {
            const result = await commandManager.execute("powershell", ["-Command", `Start-MpScan -ScanType CustomScan -ScanPath "${absolutePath}"`]);
            return {
                success: result.success,
                threatsFound: false, // Windows Defender doesn't return detection in exit code easily this way
                message: "Windows Defender scan initiated.",
                details: result.stdout
            };
        }
    } catch (e) {
        return { success: false, threatsFound: false, message: "Unexpected error during AV scan", details: String(e) };
    }

    return { success: false, threatsFound: false, message: "Manual scan not implemented for this OS" };
  }

  async updateDefinitions() {
    console.log("[ANTIVIRUS] Starting asynchronous ClamAV update...");
    // Run freshclam asynchronously
    commandManager.execute("freshclam", [])
      .then((result) => {
        if (result.success) {
          console.log("[ANTIVIRUS] ClamAV definitions updated successfully.");
        } else {
          console.error(`[ANTIVIRUS] ClamAV update failed: ${result.stderr}`);
        }
      })
      .catch((error) => {
        console.error(`[ANTIVIRUS] Unexpected error during ClamAV update: ${error}`);
      });

    return { success: true, message: "ClamAV update initiated in the background." };
  }
}

export const antivirus = new AntivirusManager();
