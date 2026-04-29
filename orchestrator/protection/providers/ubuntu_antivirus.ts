import { SystemExecutor } from "../../infrastructure/system_executor.ts";
import { resolve, normalize, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { AntivirusProvider, ScanResult } from "../interfaces.ts";

export class UbuntuAntivirusProvider implements AntivirusProvider {
  constructor(private executor: SystemExecutor) {}
  async getStatus() {
    const result = await this.executor.execute("systemctl", ["is-active", "clamav-daemon"]);
    return {
        success: result.success,
        active: result.stdout.trim() === "active",
        details: result.stdout.trim()
    };
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    const QUARANTINE_DIR = Deno.env.get("QUARANTINE_DIR") || "/var/lib/cts/quarantine";
    let srcFile: Deno.FsFile | null = null;
    try {
      // Open file first to avoid TOCTOU between stat and open
      srcFile = await Deno.open(path, { read: true });
      const stat = await srcFile.stat();

      if (!stat.isFile) {
        srcFile.close();
        srcFile = null;
        return { success: false, message: "Target is not a regular file." };
      }

      await ensureDir(QUARANTINE_DIR);
      // Attempt to set permissions, but ignore errors if we don't own the dir
      try {
        await Deno.chmod(QUARANTINE_DIR, 0o700);
      } catch { /* ignore */ }

      const fileName = basename(path);
      const destination = resolve(QUARANTINE_DIR, `${crypto.randomUUID()}_${fileName}`);

      const destFile = await Deno.open(destination, { write: true, createNew: true });
      try {
        await srcFile.readable.pipeTo(destFile.writable, { preventClose: true });
      } finally {
        try { destFile.close(); } catch { /* ignore */ }
      }

      // Close the source file before removing it
      try {
        srcFile.close();
      } catch (e) {
        if (!(e instanceof Deno.errors.BadResource)) {
            console.warn("Error closing srcFile before removal:", e);
        }
      }
      srcFile = null;

      try {
        await Deno.remove(path);
      } catch {
        // Ignore
      }

      const metadata = {
        originalPath: path,
        quarantinedAt: new Date().toISOString(),
        fileName: fileName,
        size: stat.size,
        mtime: stat.mtime,
        ino: stat.ino,
        dev: stat.dev
      };
      await Deno.writeTextFile(`${destination}.metadata.json`, JSON.stringify(metadata, null, 2));

      return {
        success: true,
        message: `File quarantined to ${destination}`,
        target: destination
      };
    } catch (e) {
      return { success: false, message: `Failed to quarantine: ${String(e)}` };
    } finally {
      if (srcFile) {
        try {
          srcFile.close();
        } catch (e) {
            // If it was already closed, this might throw BadResource which is fine in finally
            if (!(e instanceof Deno.errors.BadResource)) {
                console.error("Unexpected error in finally close:", e);
            }
        }
      }
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

    const check = await this.executor.execute("which", ["clamscan"]);
    if (!check.success) {
        return { success: false, threatsFound: false, message: "clamscan is not installed." };
    }

    const result = await this.executor.execute("clamscan", ["-r", "--", absolutePath]);
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
