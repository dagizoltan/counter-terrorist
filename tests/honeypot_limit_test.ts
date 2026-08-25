import { assertEquals, assert } from "@std/assert";
import { HoneypotService } from "../src/orchestrator/domain/protection/honeypot_service.ts";
import { LogSeverity, LogType } from "../src/orchestrator/core/ports.ts";

Deno.test("Honeypot Resilience - Session transcript truncation", async () => {
    // Mock dependencies
    const mockSidecar = {
        sendCommand: () => Promise.resolve({ success: true }),
        onEvent: () => {},
        getPersistentSidecar: () => Promise.resolve({}),
        stopSidecar: () => Promise.resolve(),
        getExecutor: () => ({ execute: () => Promise.resolve({ success: true, stdout: "" }) })
    };
    const mockFirewall = { allowPort: () => Promise.resolve({ success: true }), denyPort: () => Promise.resolve({ success: true }) };
    const mockPcap = { startCapture: () => Promise.resolve() };
    const mockLogging = { log: (entry: any) => {
        if (entry.caller.includes("session")) {
            // Check truncation
            assert(entry.payload.data.length <= 16384 + 20, "Transcript should be truncated near 16KB boundary");
            if (entry.payload.data.length > 16384) {
                assert(entry.payload.data.endsWith("... [TRUNCATED]"), "Truncated data should have suffix");
            }
        }
    }};

    const service = new HoneypotService(mockSidecar as any, mockFirewall as any, mockPcap as any, mockLogging as any);

    // Create oversized data (20KB)
    const bigData = "X".repeat(20000);

    // Trigger internal handler via sidecar event mock simulation
    // @ts-ignore: Accessing private for test
    await service.handleEvent({
        data: {
            type: "SessionData",
            port: 22,
            source_ip: "1.2.3.4",
            data: bigData
        }
    });
});
