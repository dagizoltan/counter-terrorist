import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";

export interface ProcessSnapshot {
  pid: number;
  name: string;
  exe_path: string;
  hash: string;
  cpu_usage?: number;
  memory_usage?: number;
}

export interface SystemSnapshot {
  timestamp: string;
  ports: string[];
  processes: ProcessSnapshot[];
}

export class BaselineService {
  private currentBaseline: SystemSnapshot | null = null;
  private kv: Deno.Kv | null = null;

  constructor() {
    this.initKv();
  }

  private async initKv() {
    try {
      this.kv = await Deno.openKv();
      const res = await this.kv.get<SystemSnapshot>(["baseline"]);
      if (res.value) {
        this.currentBaseline = res.value;
        console.log("[BASELINE] Restored from Deno KV.");
      }
    } catch (e) {
      console.error("[BASELINE] Failed to initialize Deno KV:", e);
    }
  }

  async captureSnapshot(): Promise<SystemSnapshot> {
    const os = Deno.build.os;
    let ports: string[] = [];
    let processes: ProcessSnapshot[] = [];

    // Capture Ports
    const netstatCmd = os === "windows" ? "netstat" : "ss";
    const netstatArgs = os === "windows" ? ["-ano"] : ["-tuln"];
    const netResult = await commandManager.execute(netstatCmd, netstatArgs);
    ports = netResult.stdout.split("\n").filter(l => l.includes("LISTEN") || l.includes("LISTENING"));

    // Capture Processes (via our persistent sidecar)
    try {
        const scanResult = await commandManager.sendCommand("scanner", "SCAN");
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

    return {
      timestamp: new Date().toISOString(),
      ports,
      processes
    };
  }

  async setBaseline() {
    this.currentBaseline = await this.captureSnapshot();
    if (this.kv) {
      await this.kv.set(["baseline"], this.currentBaseline);
    }
    console.log("[BASELINE] New system baseline established.");
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
            }
        }
    }
    if (!this.currentBaseline) return;

    const current = await this.captureSnapshot();

    // Check Ports drift
    const newPorts = current.ports.filter(p => !this.currentBaseline?.ports.includes(p));

    // Check Processes drift (hash/path based)
    const baselineProcs = this.currentBaseline.processes;
    const newProcs = current.processes.filter(currProc => {
        // Match by path and hash
        return !baselineProcs.some(baseProc =>
            baseProc.exe_path === currProc.exe_path && baseProc.hash === currProc.hash
        );
    });

    if (newPorts.length > 0) {
      console.warn(`[BASELINE] Port drift detected: ${newPorts.join(", ")}`);
      broadcast({ type: "WARN", message: `Drift Detected: ${newPorts.length} new listening ports!` });
    }
    if (newProcs.length > 0) {
      newProcs.forEach(p => {
        console.warn(`[BASELINE] Process drift: ${p.name} (PID: ${p.pid}, Path: ${p.exe_path}, Hash: ${p.hash})`);
      });
      broadcast({ type: "WARN", message: `Drift Detected: ${newProcs.length} new/modified processes found: ${newProcs.slice(0, 3).map(p => p.name).join(", ")}` });
    }

    return { newPorts, newProcs };
  }
}

export const baseline = new BaselineService();
