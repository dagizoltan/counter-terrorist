import { commandManager } from "../infrastructure/command_manager.ts";
import { broadcast } from "../api/ws.ts";

export interface RkhunterResult {
    success: boolean;
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

export class RkhunterManager {
    private lastResult: RkhunterResult | null = null;

    async runScan(): Promise<RkhunterResult> {
        try {
            console.log("[RKHUNTER] Starting rootkit scan...");
            const result = await commandManager.sendCommand("scanner", "RKH_SCAN");

            this.lastResult = result;

            if (result && !result.success) {
                console.warn("[RKHUNTER] Rootkit scan detected potential issues or failed.");
                broadcast({
                    type: "CRITICAL",
                    message: "Rootkit scan completed with warnings or failures.",
                    data: result
                });
            } else {
                console.log("[RKHUNTER] Rootkit scan completed successfully.");
                broadcast({
                    type: "INFO",
                    message: "Rootkit scan completed successfully.",
                });
            }

            return result;
        } catch (e) {
            const errorResult = { success: false, error: String(e) };
            this.lastResult = errorResult;
            return errorResult;
        }
    }

    getLastResult() {
        return this.lastResult;
    }
}

