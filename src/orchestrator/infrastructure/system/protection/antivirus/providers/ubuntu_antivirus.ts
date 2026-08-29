import { AntivirusProvider, ScanResult } from "../antivirus.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

/**
 * UbuntuAntivirusProvider
 * Achieves Full Dependency Hermeticity for malware analysis via native sidecar.
 */
export class UbuntuAntivirusProvider implements AntivirusProvider {
  constructor(private sidecar: SidecarManager) {}

  async getStatus(): Promise<unknown> {
    const res = await this.sidecar.sendCommand("analyzer", { type: "GetStatus" });
    return res.data;
  }

  async scanPath(path: string): Promise<ScanResult> {
    const res = await this.sidecar.sendCommand("analyzer", { type: "ScanPath", path });
    return {
      success: res.success,
      threatsFound: Boolean(res.data?.threats_found),
      message: res.stdout || res.stderr || "",
      timestamp: new Date().toISOString()
    };
  }

  async syncSignatures(): Promise<import("@core/ports.ts").CommandResult> {
    return await this.sidecar.sendCommand("analyzer", { type: "SyncSignatures" });
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    try {
      const stats = await Deno.stat(path);
      if (!stats.isFile) {
        return { success: false, message: "Target is not a regular file." };
      }
    } catch (e) {
      return { success: false, message: `Failed to access target: ${(e as Error).message}` };
    }

    const res = await this.sidecar.sendCommand("analyzer", { type: "Quarantine", path });
    const target = typeof res.data?.target === "string" ? res.data.target : undefined;
    return { success: res.success, message: res.stdout || res.stderr || "", target };
  }
}
