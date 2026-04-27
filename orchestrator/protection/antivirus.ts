import { commandManager } from "../command_manager.ts";
import { resolve, normalize } from "https://deno.land/std@0.224.0/path/mod.ts";
import { broadcast } from "../api/ws.ts";

export class AntivirusManager {
  private scheduledScans: Map<string, number> = new Map();

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
      const result = await commandManager.execute("clamscan", ["-r", path]);
      if (!result.success && result.stdout.includes("FOUND")) {
          broadcast({ type: "AV_THREAT", message: `Threat detected in ${path}!` });
      }
      return result;
    } else if (os === "windows") {
      return await commandManager.execute("powershell", ["-Command", `Start-MpScan -ScanType CustomScan -ScanPath "${path}"`]);
    }
    return { success: false, stdout: "", stderr: "Manual scan not implemented for this OS" };
  }

  /**
   * Schedules a recurring scan for a path.
   * For this milestone, we use a simple interval (ms) instead of complex cron.
   */
  scheduleScan(path: string, intervalMs: number) {
    if (this.scheduledScans.has(path)) {
      clearInterval(this.scheduledScans.get(path));
    }

    console.log(`[AV] Scheduling recurring scan for ${path} every ${intervalMs}ms`);
    const timerId = setInterval(async () => {
      console.log(`[AV] Running scheduled scan for ${path}`);
      const result = await this.scanPath(path);
      if (!result.success && result.stdout.includes("FOUND")) {
        console.warn(`[AV] Scheduled scan found threats in ${path}`);
      }
    }, intervalMs);

    this.scheduledScans.set(path, timerId);
  }

  stopScheduledScan(path: string) {
    if (this.scheduledScans.has(path)) {
      clearInterval(this.scheduledScans.get(path));
      this.scheduledScans.delete(path);
    }
  }

  async quarantineFile(filePath: string) {
    const absolutePath = resolve(normalize(filePath));
    const quarantineDir = resolve(Deno.cwd(), "quarantine");

    try {
      await Deno.mkdir(quarantineDir, { recursive: true, mode: 0o700 });
      const fileName = absolutePath.split("/").pop();
      const targetPath = resolve(quarantineDir, `${fileName}.${Date.now()}.quarantine`);

      await Deno.rename(absolutePath, targetPath);
      console.log(`[AV] Quarantined file: ${absolutePath} -> ${targetPath}`);
      broadcast({ type: "AV_QUARANTINE", message: `File quarantined: ${fileName}` });

      return { success: true, message: `File quarantined to ${targetPath}` };
    } catch (error) {
      console.error(`[AV] Failed to quarantine file: ${error}`);
      return { success: false, message: `Failed to quarantine file: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

export const antivirus = new AntivirusManager();
