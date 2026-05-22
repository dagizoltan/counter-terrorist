import { broadcast } from "@interface/ws_handler.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";
import { Result } from "@core/result.ts";
import { withTelemetry } from "@core/service_utils.ts";

export interface RkhunterResult {
    success: boolean;
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

export class RkhunterManager {
    private lastResult: RkhunterResult | null = null;
    public runScan: () => Promise<Result<RkhunterResult>>;

    constructor(private sidecar: SidecarManager) {
        this.runScan = withTelemetry("Protection:Rkhunter", this._runScan.bind(this), loggingService);
    }

    private async _runScan(): Promise<RkhunterResult> {
        try {
            // RKH_SCAN is a specialized scan type that checks for known rootkit artifacts
            let result = await this.sidecar.sendCommand("analyzer", { type: "RKH_SCAN" }) as any;

            // BUG-12: Rkhunter sidecar response normalization
            if (result && result.data) {
                result = {
                    success: result.success,
                    stdout: result.data.stdout,
                    stderr: result.data.stderr,
                    ...result.data
                };
            }

            this.lastResult = result;

            if (result && !result.success) {
                broadcast({
                    type: "AUDIT_EVENT",
                    data: {
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
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
                caller: "orchestrator:infra:system:protection:rkhunter",
                message: `rkhunter scan failed: ${(e as Error).message}`
            });
            const errResult = { success: false, error: (e as Error).message } as any;
            this.lastResult = errResult;
            throw e;
        }
    }

    getLastResult() {
        return this.lastResult;
    }
}
