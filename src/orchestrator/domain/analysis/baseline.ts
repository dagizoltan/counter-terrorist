import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { broadcast } from "@api/ws.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export interface ProcessSnapshot {
  pid: number;
  name: string;
  exe_path: string;
  hash: string;
  cpu_usage?: number;
  memory_usage?: number;
  key?: string; // Pre-computed unique identifier (exe_path:hash)
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

const CRITICAL_FILES_REGEX = /\/etc\/shadow|\/etc\/sudoers|authorized_keys/;

export class BaselineService {
  private currentBaseline: SystemSnapshot | null = null;
  private isInitialized = false;
  private previousProcessSet = new Set<string>();

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
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:analysis:baseline",
            message: "Restored from Deno KV."
        });
      }
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:analysis:baseline",
          message: `Failed to restore baseline from KV: ${e}`
      });
    }
  }

  private updateCaches(snapshot: SystemSnapshot) {
    // Avoid intermediate array allocations for large sets
    this.baselineFileMap.clear();
    if (snapshot.files) {
      for (const f of snapshot.files) {
        this.baselineFileMap.set(f.path, f.hash);
      }
    }

    this.baselinePortSet.clear();
    for (const p of snapshot.ports) {
      this.baselinePortSet.add(p);
    }

    this.baselineProcessSet.clear();
    for (const p of snapshot.processes) {
      this.baselineProcessSet.add(this.getProcessKey(p));
    }
  }

  private getProcessKey(p: ProcessSnapshot): string {
    // Prefer pre-computed key to avoid repeated string concatenations
    return p.key || `${p.exe_path}:${p.hash}`;
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
          const parts = l.trim().split(/\s+/);
          // BUG-6.6 FIX: Robustly parse 'ss' output using column headers
          // Standard ss output format:
          // Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port
          // We look for the "Local Address:Port" column.
          // If columns shifted, we fallback to regex.
          let addrPort = parts[4] || "";

          // Better logic: the local address is usually the second to last column
          if (parts.length >= 5) {
              addrPort = parts[parts.length - 2];
          }

          // Strip [::] brackets for IPv6
          return addrPort.replace(/^\[|\]$/g, "");
        })
        .filter(p => p !== "" && p !== "Local");
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
        const scanResult = await this.sidecar.sendCommand("analyzer", "SCAN");
        const data = scanResult.data as any;
        if (scanResult.success && data && data.processes) {
            const scanProcs = data.processes;
            processes = new Array(scanProcs.length);
            for (let i = 0; i < scanProcs.length; i++) {
                const p = scanProcs[i];
                processes[i] = {
                    pid: p.pid,
                    name: p.name,
                    exe_path: p.exe_path,
                    hash: p.hash,
                    key: `${p.exe_path}:${p.hash}`,
                };
            }
        }
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:analysis:baseline",
            message: `Failed to capture processes from scanner: ${(e as Error).message}`
        });
    }

    // Capture Sensitive Files
    const sensitivePaths = ["/etc", "/usr/local/bin"];
    try {
      const res = await this.sidecar.sendCommand("analyzer", { type: "DIR_SCAN", paths: sensitivePaths });
      const data = res.data as any;
      if (res.success && data && data.files) {
        files = files.concat(data.files);
      }
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:analysis:baseline",
          message: `Failed to scan sensitive files: ${(e as Error).message}`
      });
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
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.SUCCESS,
        caller: "orchestrator:domain:analysis:baseline",
        message: "New system baseline established."
    });
    broadcast({
      type: "AUDIT_EVENT",
      data: {
          type: LogType.ACTIVITY,
          severity: LogSeverity.SUCCESS,
          caller: "system:baseline",
          message: "New system baseline established."
      }
    });
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

    // Optimized process drift and ephemeral filtering (O(N))
    // Uses Set-based lookup for O(1) time complexity instead of O(M) .some()
    const newProcs: ProcessSnapshot[] = [];
    const currentProcessKeys = new Set<string>();

    for (const currProc of current.processes) {
      const key = this.getProcessKey(currProc);
      currentProcessKeys.add(key);

      // Drift is only reported if it persists across scans (avoids noise from short-lived processes)
      if (this.isInitialized && !this.baselineProcessSet.has(key) && this.previousProcessSet.has(key)) {
        newProcs.push(currProc);
      }
    }

    if (!this.isInitialized) {
      this.isInitialized = true;
    }

    // Update previous processes for next run
    this.previousProcessSet = currentProcessKeys;

    // Check Filesystem drift
    const currentFiles = current.files || [];
    const changedFiles = currentFiles.filter(currFile => {
        const baseHash = this.baselineFileMap.get(currFile.path);
        return baseHash === undefined || baseHash !== currFile.hash;
    });

    if (newPorts.length > 0) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:analysis:baseline",
          message: `Port drift detected: ${newPorts.join(", ")}`
      });
      broadcast({
        type: "DRIFT_PORT",
        message: `Drift Detected: ${newPorts.length} new listening ports!`,
        data: newPorts
      });
    }
    if (newProcs.length > 0) {
      newProcs.forEach(p => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:analysis:baseline",
            message: `Process drift: ${p.name} (PID: ${p.pid}, Path: ${p.exe_path}, Hash: ${p.hash})`
        });
      });
      broadcast({
        type: "DRIFT_PROCESS",
        message: `Drift Detected: ${newProcs.length} new/modified processes found.`,
        data: newProcs.map(p => ({ name: p.name, pid: p.pid, path: p.exe_path }))
      });
    }
    if (changedFiles.length > 0) {
        const criticalChanges = changedFiles.filter(f => CRITICAL_FILES_REGEX.test(f.path));

        if (criticalChanges.length > 0) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:baseline",
                message: `CRITICAL FILE DRIFT: ${criticalChanges.map(f => f.path).join(", ")}`
            });
            broadcast({
                type: "AUDIT_EVENT",
                data: {
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "system:baseline",
                    message: `CRITICAL FILE MODIFIED: ${criticalChanges[0].path} (and ${criticalChanges.length - 1} others)`,
                    data: criticalChanges
                }
            });
        } else {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:analysis:baseline",
                message: `Filesystem drift: ${changedFiles.length} files modified.`
            });
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
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:analysis:baseline",
        message: `Starting background monitoring loop (Interval: ${intervalMs}ms)`
    });
    setInterval(async () => {
      try {
        await this.checkDrift();
      } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:analysis:baseline",
            message: `Drift check loop failed: ${e}`
        });
      }
    }, intervalMs);
  }
}
