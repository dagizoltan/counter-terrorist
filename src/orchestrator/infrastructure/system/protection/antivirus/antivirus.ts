import { AntivirusProvider, ScanResult } from "../interfaces.ts";
export type { AntivirusProvider, ScanResult };

export class AntivirusManager {
  constructor(private provider: AntivirusProvider) {}

  async getStatus() {
    return await this.provider.getStatus();
  }

  async quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    return await this.provider.quarantine(path);
  }

  async scanPath(path: string): Promise<ScanResult> {
    return await this.provider.scanPath(path);
  }
}
