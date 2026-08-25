import { assertEquals } from "@std/assert";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { AuditVerifier } from "../src/orchestrator/domain/analysis/audit_verifier.ts";
import { LoggingPort } from "../src/orchestrator/core/ports.ts";
import { delay } from "@std/async/delay";

const mockLogging: LoggingPort = {
    log: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
    setConfig: () => {},
    setKv: () => {},
    enableGlobalIntercept: () => {}
};

class MockAuditRepo {
    public events: any[] = [];
    async save(event: any) {
        // Simulate write contention/latency
        await delay(Math.random() * 10);
        this.events.push(event);
    }
    async saveMany(events: any[]) {
        for (const event of events) {
            await this.save(event);
        }
    }
    async getLatest(limit: number) { return []; }
    async count() { return this.events.length; }
    async commitMerkleRoot(root: string) {
        await delay(20);
    }
}

Deno.test("KV Persistence Stress: Batched writes under contention", async () => {
    const repo = new MockAuditRepo();
    const verifier = new AuditVerifier(repo as any, mockLogging);
    const auditService = new AuditService(repo as any, mockLogging, verifier);

    // Inject mock methods to bypass actual repo calls that might fail if not fully mocked
    (auditService as any).restoreChainHead = () => Promise.resolve({ success: true });

    await auditService.init();

    // Mock setConfig for batching if needed, though AuditService uses internal queue

    const totalEvents = 500;
    const promises = [];

    for (let i = 0; i < totalEvents; i++) {
        auditService.logEvent({
            type: "STRESS_TEST",
            severity: "INFO",
            message: `Stress event ${i}`,
            data: { index: i }
        });
    }

    // AuditService uses a queue and async processing.
    // Wait for queue processing, buffering, and flushing to finish.
    let attempts = 0;
    while (((auditService as any).logQueue.length > 0 ||
            (auditService as any).isProcessingQueue ||
            (auditService as any).auditBuffer.length > 0 ||
            (auditService as any).isFlushing) && attempts < 100) {
        await delay(100);
        // If it's not flushing but there is stuff in the buffer, try to kick it
        if (!(auditService as any).isFlushing && (auditService as any).auditBuffer.length > 0) {
            (auditService as any).flushBuffer().catch(() => {});
        }
        attempts++;
    }

    // Final check/flush
    await (auditService as any).flushBuffer();

    console.log(`Stress Test: Logged ${repo.events.length} / ${totalEvents} events`);
    assertEquals(repo.events.length, totalEvents, "All events should be persisted even under contention");
});
