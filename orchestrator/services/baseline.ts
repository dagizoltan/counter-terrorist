import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";

export interface SystemSnapshot {
  timestamp: string;
  ports: string[];
  processes: string[];
}

export class BaselineService {
  private currentBaseline: SystemSnapshot | null = null;

  async captureSnapshot(): Promise<SystemSnapshot> {
    const os = Deno.build.os;
    let ports: string[] = [];
    let processes: string[] = [];

    // Capture Ports
    const netstatCmd = os === "windows" ? "netstat" : "ss";
    const netstatArgs = os === "windows" ? ["-ano"] : ["-tuln"];
    const netResult = await commandManager.execute(netstatCmd, netstatArgs);
    ports = netResult.stdout.split("\n").filter(l => l.includes("LISTEN") || l.includes("LISTENING"));

    // Capture Processes (via our sidecar)
    const scanResult = await commandManager.runSidecar("scanner");
    if (scanResult.success && scanResult.data) {
      processes = scanResult.data.processes.map((p: any) => p.name);
    }

    return {
      timestamp: new Date().toISOString(),
      ports,
      processes
    };
  }

  async setBaseline() {
    this.currentBaseline = await this.captureSnapshot();
    console.log("[BASELINE] New system baseline established.");
    broadcast({ type: "INFO", message: "New system baseline established." });
    return this.currentBaseline;
  }

  async checkDrift() {
    if (!this.currentBaseline) return;

    const current = await this.captureSnapshot();
    const newPorts = current.ports.filter(p => !this.currentBaseline?.ports.includes(p));
    const newProcs = current.processes.filter(p => !this.currentBaseline?.processes.includes(p));

    if (newPorts.length > 0) {
      broadcast({ type: "WARN", message: `Drift Detected: ${newPorts.length} new listening ports!` });
    }
    if (newProcs.length > 0) {
      broadcast({ type: "WARN", message: `Drift Detected: New processes found: ${newProcs.slice(0, 3).join(", ")}` });
    }

    return { newPorts, newProcs };
  }
}

export const baseline = new BaselineService();
