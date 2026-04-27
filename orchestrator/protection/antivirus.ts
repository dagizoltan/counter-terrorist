import { commandManager } from "../command_manager.ts";
import { resolve, normalize, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir, copy } from "https://deno.land/std@0.224.0/fs/mod.ts";

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

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    const QUARANTINE_DIR = "/var/lib/cts/quarantine";
    try {
      // TOCTOU Protection: Verify the file still exists and get its current metadata
      const initialStat = await Deno.stat(path);
      if (!initialStat.isFile) {
        return { success: false, message: "Target is not a file." };
      }

      await ensureDir(QUARANTINE_DIR);
      // Attempt to set restrictive permissions if on Linux
      if (Deno.build.os === "linux") {
        await Deno.chmod(QUARANTINE_DIR, 0o700);
      }

      const fileName = basename(path);
      const destination = resolve(QUARANTINE_DIR, `${Date.now()}_${fileName}`);

      // Final check: ensure mtime hasn't changed since we started the quarantine process
      const currentStat = await Deno.stat(path);
      if (currentStat.mtime?.getTime() !== initialStat.mtime?.getTime()) {
        return { success: false, message: "Security Warning: File modified during quarantine process. Aborting." };
      }

      try {
        await Deno.rename(path, destination);
      } catch (e) {
        // Fallback for cross-device moves
        await copy(path, destination);
        await Deno.remove(path);
      }

      const metadata = {
        originalPath: path,
        quarantinedAt: new Date().toISOString(),
        fileName: fileName,
        size: initialStat.size,
        mtime: initialStat.mtime
      };
      await Deno.writeTextFile(`${destination}.metadata.json`, JSON.stringify(metadata, null, 2));

      return {
        success: true,
        message: `File quarantined to ${destination}`,
        target: destination
      };
    } catch (e) {
      return { success: false, message: `Failed to quarantine file: ${String(e)}` };
    }
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
            const threatsFound = result.stdout.includes("Infected files: 1") || !result.success && result.stdout.includes("Infected files:");

            if (threatsFound) {
              // Extract the infected file path from clamscan output if possible
              // clamscan output for infected files looks like: "/path/to/file: VirusName FOUND"
              const lines = result.stdout.split("\n");
              for (const line of lines) {
                if (line.includes(" FOUND")) {
                  // Robust parsing: use lastIndexOf(':') to handle paths with colons
                  const lastColonIndex = line.lastIndexOf(":");
                  if (lastColonIndex !== -1) {
                    const infectedPath = line.substring(0, lastColonIndex).trim();
                    if (infectedPath) {
                      await this.quarantine(infectedPath);
                    }
                  }
                }
              }
            }

            // Clamscan exit codes: 0 = no virus, 1 = virus found, 2 = error
            return {
                success: result.success || threatsFound,
                threatsFound: threatsFound,
                message: result.success ? "Scan completed successfully." : (threatsFound ? "Scan detected and quarantined threats." : "Scan failed."),
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
}

export const antivirus = new AntivirusManager();
