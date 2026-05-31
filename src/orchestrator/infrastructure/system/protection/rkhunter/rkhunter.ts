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

interface AnalyzerRkhResponse {
    success: boolean;
    data: {
        stdout: string;
        stderr: string;
        exit_code?: number;
        [key: string]: unknown;
    };
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
            const raw = await this.sidecar.sendCommand("analyzer", { type: "RKH_SCAN" });
            const analyzerRes = raw as unknown as AnalyzerRkhResponse;

            let result: RkhunterResult;

            // BUG-12: Rkhunter sidecar response normalization
            if (analyzerRes && analyzerRes.data) {
                result = {
                    success: analyzerRes.success,
                    stdout: analyzerRes.data.stdout,
                    stderr: analyzerRes.data.stderr,
                    exit_code: analyzerRes.data.exit_code,
                    error: analyzerRes.data.error as string | undefined
                };
            } else {
                result = {
                    success: analyzerRes?.success ?? false,
                    error: "Invalid response from analyzer sidecar"
                };
            }

            this.lastResult = result;

            if (!result.success) {
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
            const errResult: RkhunterResult = { success: false, error: (e as Error).message };
            this.lastResult = errResult;
            throw e;
        }
    }

    getLastResult(): RkhunterResult | null {
        return this.lastResult;
    }
}
