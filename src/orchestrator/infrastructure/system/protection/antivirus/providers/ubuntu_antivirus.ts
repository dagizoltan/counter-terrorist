import { AntivirusProvider, ScanResult } from "../antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class UbuntuAntivirusProvider implements AntivirusProvider {
  constructor(private executor: SystemExecutor) {}

  async getStatus(): Promise<any> {
    return await this.executor.execute("clamscan", ["--version"]);
  }

  async scanPath(path: string): Promise<ScanResult> {
    const result = await this.executor.execute("clamscan", ["-r", path]);
    return {
      success: result.success,
      threatsFound: !result.success, // simplified
      message: result.stdout,
      timestamp: new Date().toISOString()
    } as any; // Cast for now due to ScanResult definition
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    const quarantineDir = "./volume/quarantine";
    await this.executor.execute("mkdir", ["-p", quarantineDir]);
    
    const fileName = path.split("/").pop();
    const target = `${quarantineDir}/${fileName}_${Date.now()}.quarantine`;
    
    // 1. Move the file, 2. Strip all permissions (read, write, execute)
    const moveRes = await this.executor.execute("mv", [path, target]);
    if (moveRes.success) {
        await this.executor.execute("chmod", ["000", target]);
        return { success: true, message: `Malware isolated and stripped of permissions at ${target}`, target };
    }
    
    return { success: false, message: `Failed to quarantine ${path}: ${moveRes.stderr}` };
  }
}
