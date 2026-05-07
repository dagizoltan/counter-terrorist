import { AntivirusProvider, ScanResult } from "../antivirus.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

/**
 * UbuntuAntivirusProvider
 * Achieves Full Dependency Hermeticity for malware analysis via native sidecar.
 */
export class UbuntuAntivirusProvider implements AntivirusProvider {
  constructor(private sidecar: SidecarManager) {}

  async getStatus(): Promise<any> {
    return await this.sidecar.sendCommand("scanner", { type: "GetStatus" });
  }

  async scanPath(path: string): Promise<ScanResult> {
    const res = await this.sidecar.sendCommand("scanner", { type: "ScanPath", path });
    return {
      success: res.success,
      threatsFound: res.data?.threats_found || false,
      message: res.stdout || res.stderr || "",
      timestamp: new Date().toISOString()
    };
  }

  async syncSignatures(): Promise<import("@core/ports.ts").CommandResult> {
    return await this.sidecar.sendCommand("scanner", { type: "SyncSignatures" });
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    const res = await this.sidecar.sendCommand("scanner", { type: "Quarantine", path });
    return { success: res.success, message: res.stdout || res.stderr || "", target: res.data?.target };
  }
}
