import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { LoggingPort } from "../src/orchestrator/core/ports.ts";
import { delay } from "https://deno.land/std@0.208.0/async/delay.ts";

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
    const auditService = new AuditService(repo as any, mockLogging, undefined);

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
    // Wait for queue processing to finish.
    let attempts = 0;
    while (((auditService as any).logQueue.length > 0 || (auditService as any).isProcessingQueue) && attempts < 50) {
        await delay(100);
        attempts++;
    }

    // Force final flush
    await (auditService as any).flushBuffer();

    console.log(`Stress Test: Logged ${repo.events.length} / ${totalEvents} events`);
    assertEquals(repo.events.length, totalEvents, "All events should be persisted even under contention");
});
