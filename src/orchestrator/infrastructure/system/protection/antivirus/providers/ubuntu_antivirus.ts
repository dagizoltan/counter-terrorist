import { AntivirusProvider, ScanResult } from "../antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class UbuntuAntivirusProvider implements AntivirusProvider {
  constructor(private executor: SystemExecutor) {}

  async getStatus(): Promise<any> {
    return await this.executor.execute("clamscan", ["--version"]);
  }

  async scanPath(path: string): Promise<ScanResult> {
    const { validatePath } = await import("../../../validation.ts");
    const { normalize } = await import("https://deno.land/std@0.224.0/path/mod.ts");

    const normalizedPath = normalize(path);
    if (!validatePath(normalizedPath)) {
        return {
            success: false,
            threatsFound: false,
            message: "SECURITY VIOLATION: Invalid scan path.",
            timestamp: new Date().toISOString()
        };
    }

    const result = await this.executor.execute("clamscan", ["-r", normalizedPath]);
    return {
      success: result.success,
      threatsFound: !result.success,
      message: result.stdout,
      timestamp: new Date().toISOString()
    };
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    const { validatePath } = await import("../../../validation.ts");
    const { normalize } = await import("https://deno.land/std@0.224.0/path/mod.ts");

    const normalizedPath = normalize(path);
    if (!validatePath(normalizedPath)) {
        return { success: false, message: "SECURITY VIOLATION: Invalid quarantine path." };
    }

    const quarantineDir = "./volume/quarantine";
    await this.executor.execute("mkdir", ["-p", quarantineDir]);
    
    const fileName = normalizedPath.split("/").pop();
    const target = `${quarantineDir}/${fileName}_${Date.now()}.quarantine`;
    
    const moveRes = await this.executor.execute("mv", [normalizedPath, target]);
    if (moveRes.success) {
        await this.executor.execute("chmod", ["000", target]);
        return { success: true, message: `Malware isolated and stripped of permissions at ${target}`, target };
    }
    
    return { success: false, message: `Failed to quarantine ${normalizedPath}: ${moveRes.stderr}` };
  }
}
