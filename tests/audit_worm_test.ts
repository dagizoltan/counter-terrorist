import { assertEquals } from "@std/assert";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { WormRepository } from "../src/orchestrator/domain/repositories/worm_repository.ts";
import { LoggingPort } from "../src/orchestrator/core/ports.ts";

class MockLogging implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log() {}
    async getRecentLogs() { return []; }
    async logLegacy() {}
    setKv() {}
    async shutdown() {}
}

class MockRepo {
    async getLatest() { return []; }
    async save() {}
    async saveMany() {}
    async count() { return 0; }
}

Deno.test("AuditService: WORM Mirroring", async () => {
    const wormPath = "./tests/worm_test.log";
    try { await Deno.remove(wormPath); } catch { /* ignore */ }

    const wormRepo = new WormRepository(wormPath);
    const audit = new AuditService(new MockRepo() as any, new MockLogging());
    audit.setWormRepository(wormRepo);

    // Trigger internal ready state
    (audit as any).initialized = true;

    audit.logEvent({
        type: "CRITICAL",
        message: "Test critical event",
        severity: "error",
        caller: "test"
    });

    // We need to wait for the queue to process
    await new Promise(r => setTimeout(r, 1000));

    const logs = wormRepo.getLogs();
    assertEquals(logs.length, 1, "Should have 1 mirrored log in WORM");
    assertEquals(logs[0].message, "Test critical event");

    const fileContent = await Deno.readTextFile(wormPath);
    assertEquals(fileContent.includes("Test critical event"), true, "File should contain the event");

    try { await Deno.remove(wormPath); } catch { /* ignore */ }
});
