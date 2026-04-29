import { SidecarManager } from "../infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../infrastructure/system_executor.ts";
import { broadcast } from "../api/ws.ts";
import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export interface ProcessSnapshot {
  pid: number;
  name: string;
  exe_path: string;
  hash: string;
  cpu_usage?: number;
  memory_usage?: number;
}

export interface FileSnapshot {
  path: string;
  hash: string;
  mtime: string;
}

export interface SystemSnapshot {
  timestamp: string;
  ports: string[];
  processes: ProcessSnapshot[];
  files?: FileSnapshot[];
}

export class BaselineService {
  private currentBaseline: SystemSnapshot | null = null;
  private previousProcesses: ProcessSnapshot[] | null = null;

  // Caches for faster drift detection
  private baselineFileMap = new Map<string, string>();
  private baselinePortSet = new Set<string>();
  private baselineProcessSet = new Set<string>();

  constructor(
    private kv: Deno.Kv,
    private sidecar: SidecarManager,
    private executor: SystemExecutor,
    private logging: LoggingPort
  ) {
    this.restoreBaseline();
  }

  private async restoreBaseline() {
    try {
      const res = await this.kv.get<SystemSnapshot>(["baseline"]);
      if (res.value) {
        this.currentBaseline = res.value;
        this.updateCaches(res.value);
        this.logging.log("[BASELINE] Restored from Deno KV.", SyslogSeverity.INFORMATIONAL);
      }
    } catch (e) {
      this.logging.log(`[BASELINE] Failed to restore baseline from KV: ${e}`, SyslogSeverity.ERROR);
    }
  }

  private updateCaches(snapshot: SystemSnapshot) {
    this.baselineFileMap = new Map((snapshot.files || []).map(f => [f.path, f.hash]));
    this.baselinePortSet = new Set(snapshot.ports);
    this.baselineProcessSet = new Set(snapshot.processes.map(p => `${p.exe_path}:${p.hash}`));
  }

  async captureSnapshot(): Promise<SystemSnapshot> {
    const os = Deno.build.os;
    let ports: string[] = [];
    let processes: ProcessSnapshot[] = [];
    let files: FileSnapshot[] = [];

    // Capture Ports
    if (os === "linux") {
      const result = await this.executor.execute("ss", ["-tuln"]);
      // Parse 'ss' output: Extract local address:port from LISTEN lines
      ports = result.stdout.split("\n")
        .filter(l => l.includes("LISTEN"))
        .map(l => {
          const parts = l.split(/\s+/);
          return parts[4] || ""; // Local Address:Port is typically the 5th column
        })
        .filter(p => p !== "");
    } else if (os === "windows") {
      const result = await this.executor.execute("netstat", ["-ano"]);
      ports = result.stdout.split("\n")
        .filter(l => l.includes("LISTENING"))
        .map(l => {
          const parts = l.trim().split(/\s+/);
          return parts[1] || ""; // Local Address is typically the 2nd column
        })
        .filter(p => p !== "");
    }

    // Capture Processes (via our persistent sidecar)
    try {
        const scanResult = await this.sidecar.sendCommand("scanner", "SCAN");
        if (scanResult && scanResult.processes) {
            processes = scanResult.processes.map((p: any) => ({
                pid: p.pid,
                name: p.name,
                exe_path: p.exe_path,
                hash: p.hash,
            }));
        }
    } catch (e) {
        console.error("[BASELINE] Failed to capture processes from scanner:", e);
    }

    // Capture Sensitive Files
    const sensitivePaths = ["/etc", "/usr/local/bin"];
    for (const dir of sensitivePaths) {
      try {
        const res = await this.sidecar.sendCommand("scanner", { type: "DIR_SCAN", path: dir });
        if (res && res.files) {
          files = files.concat(res.files);
        }
      } catch (e) {
        // Ignore errors for non-existent or inaccessible paths
      }
    }

    return {
      timestamp: new Date().toISOString(),
      ports,
      processes,
      files
    };
  }

  async setBaseline() {
    this.currentBaseline = await this.captureSnapshot();
    this.updateCaches(this.currentBaseline);
    if (this.kv) {
      await this.kv.set(["baseline"], this.currentBaseline);
    }
    this.logging.log("[BASELINE] New system baseline established.", SyslogSeverity.NOTICE);
    broadcast({ type: "INFO", message: "New system baseline established." });
    return this.currentBaseline;
  }

  async checkDrift() {
    if (!this.currentBaseline) {
        // Try to load from KV if not loaded yet
        if (this.kv) {
            const res = await this.kv.get<SystemSnapshot>(["baseline"]);
            if (res.value) {
                this.currentBaseline = res.value;
                this.updateCaches(res.value);
            }
        }
    }
    if (!this.currentBaseline) return null;

    const current = await this.captureSnapshot();

    // Check Ports drift
    const newPorts = current.ports.filter(p => !this.baselinePortSet.has(p));

    // Check Processes drift (hash/path based)
    let newProcs = current.processes.filter(currProc => {
        // Match by path and hash
        return !this.baselineProcessSet.has(`${currProc.exe_path}:${currProc.hash}`);
    });

    // Ephemeral process filter (N-04)
    if (this.previousProcesses) {
      const prevSet = new Set(this.previousProcesses.map(p => `${p.exe_path}:${p.hash}`));
      newProcs = newProcs.filter(currProc => {
        return prevSet.has(`${currProc.exe_path}:${currProc.hash}`);
      });
    } else {
      // If no previous processes, assume all are ephemeral on first run to avoid noise
      newProcs = [];
    }

    // Update previous processes for next run
    this.previousProcesses = current.processes;

    // Check Filesystem drift
    const currentFiles = current.files || [];
    const changedFiles = currentFiles.filter(currFile => {
        const baseHash = this.baselineFileMap.get(currFile.path);
        return baseHash === undefined || baseHash !== currFile.hash;
    });

    if (newPorts.length > 0) {
      console.warn(`[BASELINE] Port drift detected: ${newPorts.join(", ")}`);
      broadcast({
        type: "DRIFT_PORT",
        message: `Drift Detected: ${newPorts.length} new listening ports!`,
        data: newPorts
      });
    }
    if (newProcs.length > 0) {
      newProcs.forEach(p => {
        console.warn(`[BASELINE] Process drift: ${p.name} (PID: ${p.pid}, Path: ${p.exe_path}, Hash: ${p.hash})`);
      });
      broadcast({
        type: "DRIFT_PROCESS",
        message: `Drift Detected: ${newProcs.length} new/modified processes found.`,
        data: newProcs.map(p => ({ name: p.name, pid: p.pid, path: p.exe_path }))
      });
    }
    if (changedFiles.length > 0) {
        const criticalFiles = ["/etc/shadow", "/etc/sudoers", "authorized_keys"];
        const criticalChanges = changedFiles.filter(f => criticalFiles.some(c => f.path.includes(c)));

        if (criticalChanges.length > 0) {
            this.logging.log(`[BASELINE] CRITICAL FILE DRIFT: ${criticalChanges.map(f => f.path).join(", ")}`, SyslogSeverity.CRITICAL);
            broadcast({
                type: "CRITICAL",
                message: `CRITICAL FILE MODIFIED: ${criticalChanges[0].path} (and ${criticalChanges.length - 1} others)`,
                data: criticalChanges
            });
        } else {
            console.warn(`[BASELINE] Filesystem drift: ${changedFiles.length} files modified.`);
            broadcast({
                type: "DRIFT_FILE",
                message: `Drift Detected: ${changedFiles.length} files modified in sensitive directories.`,
                data: changedFiles.slice(0, 10)
            });
        }
    }

    return { newPorts, newProcs, changedFiles };
  }

  /**
   * Starts the background drift monitoring loop.
   */
  startMonitor(intervalMs: number = 60000) {
    this.logging.log(`[BASELINE] Starting background monitoring loop (Interval: ${intervalMs}ms)`, SyslogSeverity.INFORMATIONAL);
    setInterval(async () => {
      try {
        await this.checkDrift();
      } catch (e) {
        this.logging.log(`[BASELINE] Drift check loop failed: ${e}`, SyslogSeverity.ERROR);
      }
    }, intervalMs);
  }
}

