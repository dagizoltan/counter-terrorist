import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { KernelService } from "../src/orchestrator/domain/protection/kernel_service.ts";

Deno.test("Kernel Resilience - Hook auto-throttling on latency spike", async () => {
    const sentinelCommands: any[] = [];
    const mockSidecar = {
        sendCommand: (sidecar: string, cmd: any) => {
            sentinelCommands.push({ sidecar, cmd });
            return Promise.resolve({ success: true, data: {} });
        }
    };

    const mockLogging = { log: () => {} };
    const mockAudit = { logEvent: () => {}, getLogging: () => mockLogging };

    const service = new KernelService(null as any, mockAudit as any, {} as any, mockSidecar as any);

    // Simulate telemetry update with high latency hook
    // Hook ID 5 (e.g. sys_enter_ptrace) avg 60us (Threshold is 50us)
    const stats = {
        "5": { avg_ns: 60000, count: 1000 },
        "10": { avg_ns: 5000, count: 100 }
    };

    // @ts-ignore: Triggering private handler for test
    await service.analyzeHookPerformance(stats);

    const throttleCmd = sentinelCommands.find(c => c.sidecar === "sentinel" && c.cmd.type === "UPDATE_HOOK_CONTROL");
    assert(throttleCmd !== undefined, "Should have issued a throttle command");
    assertEquals(throttleCmd.cmd.hook_id, 5);
    assertEquals(throttleCmd.cmd.enabled, false);
});

Deno.test("Kernel Hardening - Orchestrator self-allowlist", async () => {
    const sentinelCommands: any[] = [];
    const mockSidecar = {
        sendCommand: (sidecar: string, cmd: any) => {
            sentinelCommands.push({ sidecar, cmd });
            return Promise.resolve({ success: true, data: {} });
        }
    };

    const mockLogging = { log: () => {} };
    const mockAudit = { logEvent: () => {}, getLogging: () => mockLogging };
    const mockExecutor = { execute: () => Promise.resolve({ success: true, stdout: "" }) };
    const mockConfig = {
        getBoolean: () => false,
        getEnv: () => undefined
    };

    const service = new KernelService(mockExecutor as any, mockAudit as any, mockConfig as any, mockSidecar as any);

    // Stub Deno.build.os
    const originalOs = Deno.build.os;
    Object.defineProperty(Deno.build, "os", { value: "linux" });

    try {
        await service.start();

        const lsmCmd = sentinelCommands.find(c => c.cmd.type === "LSM_SYSCALL_ALLOWLIST");
        assert(lsmCmd !== undefined, "Should have deployed LSM allowlist for self");
        assertEquals(lsmCmd.cmd.pid, Deno.pid);
        assert(lsmCmd.cmd.allowed_syscalls.includes("read"), "Allowlist should include basic IO");
        assert(lsmCmd.cmd.allowed_syscalls.includes("prctl"), "Allowlist should include camouflage ops");
    } finally {
        Object.defineProperty(Deno.build, "os", { value: originalOs });
    }
});
