import { assertEquals } from "@std/assert";
import { SidecarManager } from "../../src/orchestrator/infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "../../src/orchestrator/infrastructure/system/system_executor.ts";
import { LoggingPort, LogEntry } from "../../src/orchestrator/core/ports.ts";

class IntegrationMockLogger implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    log(entry: LogEntry): Promise<void> {
        this.logs.push(entry);
        console.log(`[INTEGRATION LOG] ${entry.message}`);
        return Promise.resolve();
    }
    getRecentLogs(): Promise<LogEntry[]> { return Promise.resolve(this.logs); }
    logLegacy(): Promise<void> { return Promise.resolve(); }
    setKv(): void {}
    shutdown(): Promise<void> { return Promise.resolve(); }
}

Deno.test({
    name: "Integration: Sidecar IPC and Lifecycle",
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
        const logger = new IntegrationMockLogger();
        const executor = new SystemExecutor();
        const sm = new SidecarManager(executor, logger);

        // Configure for dev mode to allow local binary execution
        (sm as any).config = {
            getEnv: (name: string) => name === "ENVIRONMENT" ? "development" : undefined,
            getBoolean: (name: string) => name === "CTS_DEV_MODE" ? true : false,
            get: () => undefined
        };

        try {
            sm.init();

            // Test spawning
            const child = await sm.getPersistentSidecar("analyzer");
            assertEquals(child !== null, true, "Should spawn analyzer sidecar");
            assertEquals(sm.isRunning("analyzer"), true, "Sidecar should be running");

            // Test IPC
            const result = await sm.sendCommand("analyzer", { type: "GetStatus" });
            assertEquals(result.success, true, "GetStatus should return success");
            assertEquals(result.message, "Operational", "Status message should be 'Operational'");

            // Test recovery (crash simulation)
            if (child) {
                console.log("Simulating sidecar crash...");
                child.kill("SIGKILL");

                // Wait for restart (exponential backoff starts at 1s)
                await new Promise(r => setTimeout(r, 2000));

                assertEquals(sm.isRunning("analyzer"), true, "Sidecar should have restarted");

                const result2 = await sm.sendCommand("analyzer", { type: "GetStatus" });
                assertEquals(result2.success, true, "Restarted sidecar should respond to commands");
            }
        } finally {
            await sm.shutdown();
        }
    }
});
