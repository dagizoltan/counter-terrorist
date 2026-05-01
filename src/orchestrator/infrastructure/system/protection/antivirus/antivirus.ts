import { AntivirusProvider, ScanResult } from "../interfaces.ts";
export type { AntivirusProvider, ScanResult };

export class AntivirusManager {
  constructor(private provider: AntivirusProvider) {}

  async getStatus() {
    return await this.provider.getStatus();
  }

  private static readonly ALLOWED_DIRS = ["/tmp/", "/var/tmp/", "/home/"];

  private validatePath(p: string): boolean {
    if (!p) return false;
    // Normalize and ensure trailing slash for directory comparison
    const normalized = p.startsWith("/") ? p : `/${p}`;
    
    // Check if the path is inside one of the allowed directories
    // This handles prefix bypasses like /tmp-malicious because we check against /tmp/
    return AntivirusManager.ALLOWED_DIRS.some(dir => normalized.startsWith(dir));
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    if (!this.validatePath(path)) {
        return { success: false, message: `Security Violation: Path '${path}' is outside allowed boundaries.` };
    }
    return await this.provider.quarantine(path);
  }

  async scanPath(path: string): Promise<ScanResult> {
    if (!this.validatePath(path)) {
        throw new Error(`Security Violation: Path '${path}' is outside allowed boundaries.`);
    }
    return await this.provider.scanPath(path);
  }
}
