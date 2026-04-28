import { commandManager } from "../services/command_manager.ts";
import { resolve, normalize, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { AntivirusProvider, ScanResult } from "./interfaces.ts";

export class UbuntuAntivirusProvider implements AntivirusProvider {
  async getStatus() {
    const result = await commandManager.execute("systemctl", ["is-active", "clamav-daemon"]);
    return {
        success: result.success,
        active: result.stdout.trim() === "active",
        details: result.stdout.trim()
    };
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    const QUARANTINE_DIR = "/var/lib/cts/quarantine";
    try {
      const initialStat = await Deno.stat(path);
      if (!initialStat.isFile) {
        return { success: false, message: "Target is not a file." };
      }

      await ensureDir(QUARANTINE_DIR);
      await Deno.chmod(QUARANTINE_DIR, 0o700);

      const fileName = basename(path);
      const destination = resolve(QUARANTINE_DIR, `${crypto.randomUUID()}_${fileName}`);

      const currentStat = await Deno.stat(path);
      if (currentStat.mtime?.getTime() !== initialStat.mtime?.getTime()) {
        return { success: false, message: "Security Warning: File modified during quarantine. Aborting." };
      }

      const destFile = await Deno.open(destination, { write: true, createNew: true });
      const srcFile = await Deno.open(path, { read: true });

      try {
        await srcFile.readable.pipeTo(destFile.writable);
      } finally {
        try {
          await Deno.remove(path);
        } catch {
          // Ignore
        }
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
      return { success: false, message: `Failed to quarantine: ${String(e)}` };
    }
  }

  async scanPath(path: string): Promise<ScanResult> {
    const absolutePath = resolve(normalize(path));
    const allowedPrefixes = ["/tmp", "/var/tmp"];
    const home = Deno.env.get("HOME");
    if (home) {
      allowedPrefixes.push(resolve(home, "Downloads"));
    }

    const isAllowed = allowedPrefixes.some((prefix) => {
      const sep = "/";
      return absolutePath === prefix || absolutePath.startsWith(prefix + sep);
    });

    if (!isAllowed) {
      return {
        success: false,
        threatsFound: false,
        message: `Path '${path}' is not in the allowed scan list`,
      };
    }

    const check = await commandManager.execute("which", ["clamscan"]);
    if (!check.success) {
        return { success: false, threatsFound: false, message: "clamscan is not installed." };
    }

    const result = await commandManager.execute("clamscan", ["-r", absolutePath]);
    const threatsFound = result.stdout.includes("Infected files: 1") || (!result.success && result.stdout.includes("Infected files:"));

    if (threatsFound) {
      const lines = result.stdout.split("\n");
      for (const line of lines) {
        if (line.includes(" FOUND")) {
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

    return {
        success: result.success || threatsFound,
        threatsFound: threatsFound,
        message: threatsFound ? "Scan detected and quarantined threats." : (result.success ? "Scan completed successfully." : "Scan failed."),
        details: result.stdout
    };
  }
}
