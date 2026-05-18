import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { AuditRepository } from "@domain/repositories/audit_repository.ts";
import { AuditEvent } from "@domain/analysis/audit.ts";
import { LoggingPort, LogEntry, LogSeverity, LogType } from "@core/ports.ts";

class MockRepo implements AuditRepository {
    public events: AuditEvent[] = [];
    public saveManyCalls = 0;

    async save(event: AuditEvent): Promise<void> {
        this.events.push(event);
    }

    async saveMany(events: AuditEvent[]): Promise<void> {
        this.events.push(...events);
        this.saveManyCalls++;
    }

    async getLatest(limit: number): Promise<AuditEvent[]> {
        return this.events.slice(-limit);
    }

    async deleteBefore(timestamp: number): Promise<number> { return 0; }
    async count(): Promise<number> { return this.events.length; }
    async *getStream(limit: number, reverse: boolean): AsyncIterable<AuditEvent> {
        for (const e of this.events) yield e;
    }
}

class MockLogging implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> {}
    async getRecentLogs(limit?: number): Promise<LogEntry[]> { return []; }
    async logLegacy(message: string, severity?: any, source?: string, payload?: any): Promise<void> {}
    setKv(kv: Deno.Kv): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("AuditService batching", async () => {
    const repo = new MockRepo();
    const logging = new MockLogging();
    const service = new AuditService(repo as any, logging);

    // Log 5 events, should be buffered
    for (let i = 0; i < 5; i++) {
        await service.logEvent({ type: "INFO", message: `Test ${i}` });
    }

    assertEquals(repo.events.length, 0, "Events should be buffered");

    // Let's log 15 more to trigger the threshold of 20
    for (let i = 5; i < 20; i++) {
        await service.logEvent({ type: "INFO", message: `Test ${i}` });
    }

    // Wait for the sequential logQueue to settle
    let attempts = 0;
    while (((service as any).logQueue.length > 0 || (service as any).isProcessingQueue || repo.events.length < 20) && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    assertEquals(repo.events.length, 20, "Events should be flushed after reaching threshold");
    assertEquals(repo.saveManyCalls, 1);

    await service.shutdown();
});
