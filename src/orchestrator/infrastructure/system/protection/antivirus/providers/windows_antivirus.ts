import { AntivirusProvider } from "../antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class WindowsAntivirusProvider implements AntivirusProvider {
  constructor(private executor: SystemExecutor) {}

  async getStatus(): Promise<unknown> {
    const res = await this.executor.execute("powershell", ["-Command", "Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled | ConvertTo-Json"]);
    return { success: res.success, data: res.data, engine: "Windows Defender" };
  }

  async scanPath(path: string): Promise<{ success: boolean; threatsFound: boolean; message: string; details?: string }> {
    const res = await this.executor.execute("powershell", ["-Command", `Start-MpScan -ScanPath "${path}" -ScanType CustomScan`]);
    return { success: res.success, threatsFound: !res.success, message: res.success ? "Scan completed" : "Scan failed", details: res.stderr };
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    // Windows Defender handles quarantine automatically or via Move-Item to a secure location
    const target = `C:\\ProgramData\\CTS\\Quarantine\\${path.split('\\').pop()}`;
    const res = await this.executor.execute("powershell", ["-Command", `Move-Item -Path "${path}" -Destination "${target}"`]);
    return { success: res.success, message: res.success ? "Quarantined" : "Failed", target };
  }

  async syncSignatures(): Promise<import("@core/ports.ts").CommandResult> {
    const res = await this.executor.execute("powershell", ["-Command", "Update-MpSignature"]);
    return { success: res.success, message: "Signatures updated", stdout: res.stdout, stderr: res.stderr };
  }
}
