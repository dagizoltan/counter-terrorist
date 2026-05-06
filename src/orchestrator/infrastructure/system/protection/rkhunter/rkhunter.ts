import { broadcast } from "@api/ws.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

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

    async runScan(): Promise<RkhunterResult> {
        try {
            const result = await this.sidecar.sendCommand("scanner", "RKH_SCAN") as any;

            this.lastResult = result;

            if (result && !result.success) {
                broadcast({
                    type: "AUDIT_EVENT",
                    data: {
                        type: LogType.AUDIT,
                        severity: LogSeverity.CRITICAL,
                        caller: "scanner:rkhunter",
                        message: "Rootkit scan completed with warnings or failures.",
                        data: result
                    }
                });
            } else {
                broadcast({
                    type: "AUDIT_EVENT",
                    data: {
                        type: LogType.AUDIT,
                        severity: LogSeverity.SUCCESS,
                        caller: "scanner:rkhunter",
                        message: "Rootkit scan completed successfully."
                    }
                });
            }

            return result;
        } catch (e) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RKHUNTER",
                message: `rkhunter scan failed: ${(e as Error).message}`
            });
            const errResult = { success: false, error: (e as Error).message };
            this.lastResult = errResult;
            return errResult;
        }
    }

    getLastResult() {
        return this.lastResult;
    }
}
