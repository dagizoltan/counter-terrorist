import { assertEquals, assertExists } from "@std/assert";
import { IpcFfiBridge } from "@infrastructure/runtime/ipc_ffi_bridge.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("IpcFfiBridge - Serialization Verification", async () => {
    const logging = new MockLoggingPort();
    const bridge = new IpcFfiBridge(logging);

    // This test checks if the FFI symbols are loaded and if basic serialization works.
    // NOTE: This requires the libcts_sec.so to be built and present.
    // If not present, bridge.ffi will be null, and we check graceful handling.

    const command = { type: "TEST", data: "value", id: "123" };
    const serialized = bridge.serializeMessagePack(command);

    if (bridge["ffi"]) {
        assertExists(serialized);
        assertEquals(serialized instanceof Uint8Array, true);
        assertEquals(serialized!.length > 0, true);
    } else {
        // Fallback or null
        assertEquals(serialized, null);
    }
});

Deno.test("IpcFfiBridge - Hash Calculation", async () => {
    const logging = new MockLoggingPort();
    const bridge = new IpcFfiBridge(logging);

    // Create a dummy file
    const path = "./test_file.tmp";
    await Deno.writeTextFile(path, "test data");

    try {
        const hash = bridge.calculateHash(path);
        if (bridge["ffi"]) {
            assertExists(hash);
            assertEquals(hash!.length, 64); // SHA256 hex
        }
    } finally {
        try { await Deno.remove(path); } catch { /* ignore */ }
    }
});
