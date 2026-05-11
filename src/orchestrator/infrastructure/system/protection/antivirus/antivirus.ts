import { AntivirusProvider, ScanResult } from "../interfaces.ts";
import { meshManager } from "@domain/orchestration/mesh.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";
import { validatePath } from "../../validation.ts";
import { Result } from "@core/result.ts";
import { withTelemetry } from "@core/service_utils.ts";

export type { AntivirusProvider, ScanResult };

export class AntivirusManager {
  public quarantine: (path: string) => Promise<Result<{ success: boolean; message: string; target?: string }>>;
  public scanPath: (path: string) => Promise<Result<ScanResult>>;
  public syncSignatures: () => Promise<Result<any>>;

  constructor(private provider: AntivirusProvider) {
    this.quarantine = withTelemetry("Protection:Quarantine", this._quarantine.bind(this), loggingService);
    this.scanPath = withTelemetry("Protection:ScanPath", this._scanPath.bind(this), loggingService);
    this.syncSignatures = withTelemetry("Protection:SyncSignatures", this._syncSignatures.bind(this), loggingService);
  }

  async getStatus() {
    return await this.provider.getStatus();
  }

  private static readonly ALLOWED_DIRS = ["/tmp/", "/var/tmp/", "/home/"];

  private validatePath(p: string): boolean {
    return validatePath(p, AntivirusManager.ALLOWED_DIRS);
  }

  private async _quarantine(path: string): Promise<{ success: boolean; message: string; target?: string }> {
    if (!this.validatePath(path)) {
        throw new Error(`Security Violation: Path '${path}' is outside allowed boundaries.`);
    }
    return await this.provider.quarantine(path);
  }

  private async _scanPath(path: string): Promise<ScanResult> {
    if (!this.validatePath(path)) {
        throw new Error(`Security Violation: Path '${path}' is outside allowed boundaries.`);
    }
    const result = await this.provider.scanPath(path);

    // GOSSIP: If a threat is found, broadcast the hash to the mesh
    if (result.success && result.threatsFound && meshManager) {
        // Extract hash from message if possible (stub scan results include hash)
        const hashMatch = result.message.match(/Scanned .+: ([a-f0-9]{64})/);
        if (hashMatch) {
            const hash = hashMatch[1];
            meshManager.broadcastThreatHash(hash, Deno.hostname()).catch(err => {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:infra:system:protection:antivirus:gossip",
                    message: `Failed to broadcast threat hash ${hash.slice(0, 8)}: ${err.message}`
                });
            });
        }
    }

    return result;
  }

  private async _syncSignatures() {
    return await this.provider.syncSignatures();
  }
}
