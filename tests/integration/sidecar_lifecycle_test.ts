import { assertEquals, assertNotEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SidecarManager } from "../../src/orchestrator/infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "../../src/orchestrator/infrastructure/system/system_executor.ts";
import { LogType, LogSeverity, LoggingPort, LogEntry } from "../../src/orchestrator/core/ports.ts";
import { ConfigurationPort } from "../../src/orchestrator/core/ports.ts";

// Mock Logging Port
const mockLogging: LoggingPort = {
    log: (entry: LogEntry) => {
        console.log(`[${entry.severity}] ${entry.caller}: ${entry.message}`);
        return Promise.resolve();
    },
    enableGlobalIntercept: () => {},
    getRecentLogs: () => Promise.resolve([]),
    logLegacy: () => Promise.resolve(),
    setKv: () => {},
    shutdown: () => Promise.resolve()
};

// Mock Configuration Port
const mockConfig: ConfigurationPort = {
    getEnv: (key: string) => {
        if (key === "ENVIRONMENT") return "test";
        if (key === "CTS_DEV_MODE") return "true";
        return undefined;
    },
    getBoolean: (key: string, defaultValue: boolean) => {
        if (key === "CTS_DEV_MODE") return true;
        return defaultValue;
    },
    getNumber: (key: string, defaultValue: number) => defaultValue,
    getToken: () => undefined,
    getMeshSecret: () => undefined
};

Deno.test({
    name: "Sidecar Integration: analyzer - lifecycle and IPC",
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
        const executor = new SystemExecutor(mockLogging);
        const sm = new SidecarManager(executor, mockLogging);
        sm.setConfig(mockConfig);
        sm.init();

        // 1. Spawning
        console.log("Starting analyzer...");
        const child = await sm.getPersistentSidecar("analyzer");
        assertExists(child, "Analyzer should spawn successfully");
        assertEquals(sm.isRunning("analyzer"), true, "Analyzer should be running");

        const pid = sm.getPID("analyzer");
        assertExists(pid, "PID should be available");
        console.log(`Analyzer PID: ${pid}`);

        // 2. IPC: Send Command
        console.log("Sending GetStatus command...");
        const result = await sm.sendCommand("analyzer", "GetStatus");
        assertEquals(result.success, true, "GetStatus should succeed");
        assertExists(result.message, "Response should have a message");
        assertEquals(result.message, "Operational", "Response message should be 'Operational'");
        console.log("Received response:", result.message);

        // 3. Lifecycle: Crash and Restart
        console.log("Simulating crash by killing process...");
        if (pid) {
            try {
                Deno.kill(pid, "SIGKILL");
            } catch (e) {
                console.log("Failed to kill process (might already be dead):", e.message);
            }
        }

        // Wait for SidecarManager to detect exit and restart (exponential backoff starts at 1s)
        console.log("Waiting for restart...");
        await new Promise(resolve => setTimeout(resolve, 2500));

        assertEquals(sm.isRunning("analyzer"), true, "Analyzer should have restarted");
        const newPid = sm.getPID("analyzer");
        assertNotEquals(newPid, pid, "New PID should be different from old PID");
        console.log(`New Analyzer PID: ${newPid}`);

        // Verify it still responds
        const result2 = await sm.sendCommand("analyzer", "GetStatus");
        assertEquals(result2.success, true, "Analyzer should respond after restart");

        // 4. Clean Shutdown
        console.log("Shutting down SidecarManager...");
        await sm.shutdown();
        assertEquals(sm.isRunning("analyzer"), false, "Analyzer should be stopped after shutdown");
    }
});
