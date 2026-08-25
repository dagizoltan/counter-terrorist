import { assertEquals, assert } from "@std/assert";
import { stub } from "@std/testing/mock";
import { SidecarManager } from "../src/orchestrator/infrastructure/runtime/sidecar_manager.ts";

Deno.test("Sidecar Resilience - Tiered IPC Timeouts", async () => {
    const mockExecutor = { execute: () => Promise.resolve({ success: true, stdout: "", stderr: "" }) };
    const logs: any[] = [];
    const mockLogging = { log: (entry: any) => {
        logs.push(entry);
        return Promise.resolve();
    } };

    // Stub IpcFfiBridge to avoid real loading
    const bridgeStub = stub(Deno, "dlopen", () => ({ close: () => {} } as any));

    try {
        const manager = new SidecarManager(mockExecutor as any, mockLogging as any);

        // Mock serializeMessagePack to avoid FFI call during command send
        (manager as any).ffi.serializeMessagePack = () => null;

    // Mock getPersistentSidecar to return a dummy child process
    const dummyChild = {
        stdin: { getWriter: () => ({
            write: () => Promise.resolve(),
            releaseLock: () => {}
        }) },
        stdout: { getReader: () => ({ read: () => new Promise(() => {}), releaseLock: () => {} }) },
        stderr: { getReader: () => ({ read: () => new Promise(() => {}), releaseLock: () => {} }) },
        pid: 1234
    };

        // @ts-ignore: Accessing private for test
        manager.getPersistentSidecar = () => Promise.resolve(dummyChild);
        manager.setConfig({ getEnv: () => undefined, getToken: () => undefined, getBoolean: () => true } as any);

        // 1. High priority command (KillProcess) - should timeout in 5s
        const startHigh = Date.now();
        const resHigh = await manager.sendCommand("sentinel", { type: "KillProcess", pid: 999 });
        const endHigh = Date.now();

        assert(!resHigh.success);
        assert(resHigh.stderr.includes("timed out after 5000ms"), `Expected timeout message but got: ${resHigh.stderr}`);
        assert(endHigh - startHigh >= 5000, `Expected at least 5s timeout, took ${endHigh - startHigh}ms`);
    } finally {
        bridgeStub.restore();
    }
});

Deno.test("Sidecar Resilience - Unexpected exit code 0 triggers restart", async () => {
    const mockExecutor = { execute: () => Promise.resolve({ success: true, stdout: "", stderr: "" }) };
    const logs: any[] = [];
    const mockLogging = { log: (entry: any) => {
        logs.push(entry);
        return Promise.resolve();
    } };

    const bridgeStub = stub(Deno, "dlopen", () => ({ close: () => {} } as any));

    try {
        const manager = new SidecarManager(mockExecutor as any, mockLogging as any);

        let restartCalled = false;
        // Mock getPersistentSidecar on the manager instance itself
        // @ts-ignore: Mocking restart logic
        const getPersistentStub = stub(manager, "getPersistentSidecar", () => {
            restartCalled = true;
            return Promise.resolve(null);
        });

        // @ts-ignore: Triggering private exit handler
        (manager as any).handleSidecarExit("sentinel", 0);

        // Wait for the async restart attempt (which is inside a setTimeout with dynamic delay)
        // For exit code 0, delay is 1000ms (attempt 1)
        await new Promise(r => setTimeout(r, 1500));

        const logEntry = logs.find(l => l.message && l.message.includes("unexpectedly. Persistent agents should not exit."));
        assert(logEntry !== undefined, "Should have logged unexpected exit 0");
        assert(restartCalled, "Should have triggered a restart attempt");
    } finally {
        bridgeStub.restore();
    }
});
