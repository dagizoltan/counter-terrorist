/**
 * GHOST_COMMAND: Sovereign Security Orchestrator
 * Entry point for the autonomous defense mesh.
 */
import { SovereignApp } from "./app/sovereign_app.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";

const app = new SovereignApp();

try {
    await app.boot();
} catch (error) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:core:system",
        message: `Sovereign Boot Failure: ${error instanceof Error ? error.message : String(error)}`,
        payload: { stack: error instanceof Error ? error.stack : undefined }
    }).finally(() => {
        Deno.exit(1);
    });
}
