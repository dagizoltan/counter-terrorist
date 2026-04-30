import { broadcast } from "../api/ws.ts";
import { SidecarManager } from "../infrastructure/sidecar_manager.ts";

export interface RkhunterResult {
    success: boolean;
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

export class RkhunterManager {
    private lastResult: RkhunterResult | null = null;

    constructor(private sidecar: SidecarManager) {}

    async runScan(): Promise<RkhunterResult | null> {
        try {
            const result = await this.sidecar.sendCommand("scanner", "RKH_SCAN");

            this.lastResult = result;

            if (result && !result.success) {
                broadcast({
                    type: "CRITICAL",
                    message: "Rootkit scan completed with warnings or failures.",
                    data: result
                });
            } else {
                broadcast({
                    type: "INFO",
                    message: "Rootkit scan completed successfully.",
                });
            }

            return result;
        } catch (e) {
            console.error("rkhunter scan failed", e);
            this.lastResult = null;
            return null;
        }
    }

    getLastResult() {
        return this.lastResult;
    }
}

