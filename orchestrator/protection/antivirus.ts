import { AntivirusProvider, ScanResult } from "./interfaces.ts";
import { UbuntuAntivirusProvider } from "./ubuntu_antivirus.ts";

export class AntivirusManager {
  private provider: AntivirusProvider;

  constructor() {
    this.provider = new UbuntuAntivirusProvider();
  }

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

export const antivirus = new AntivirusManager();
