import { commandManager } from "../command_manager.ts";
import { loggingService } from "../services/logging.ts";

export interface RkResult {
    success: boolean;
    warnings: string[];
    fullOutput: string;
}

export class RkhunterManager {
    async runCheck(): Promise<RkResult> {
        console.log("[RKHUNTER] Starting rootkit check...");
        const response = await commandManager.sendCommand("scanner", "RKHUNTER");

        if (!response || typeof response !== "object") {
            return { success: false, warnings: [], fullOutput: "Failed to communicate with scanner" };
        }

        const stdout = response.stdout || "";
        const warnings = stdout.split("\n")
            .filter((line: string) => line.includes("[ Warning ]"))
            .map((line: string) => line.trim());

        if (warnings.length > 0) {
            loggingService.logSecurityEvent({
                level: "CRITICAL",
                source: "RkhunterManager",
                type: "ROOTKIT_WARNING",
                message: `Rootkit check found ${warnings.length} warnings`,
                details: { warnings }
            });
        }

        return {
            success: response.success,
            warnings,
            fullOutput: stdout
        };
    }
}

export const rkhunter = new RkhunterManager();
