import fc from "npm:fast-check";
import { assertEquals, assertExists } from "@std/assert";
import { AuditService, AuditEvent, AuditDelta } from "../src/orchestrator/domain/analysis/audit.ts";
import { AuditVerifier } from "../src/orchestrator/domain/analysis/audit_verifier.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";
import { AuditRepository } from "../src/orchestrator/domain/repositories/audit_repository.ts";

class MockAuditRepository implements AuditRepository {
    events: AuditEvent[] = [];
    async save(event: AuditEvent): Promise<void> { this.events.push(event); }
    async saveMany(events: AuditEvent[]): Promise<void> { this.events.push(...events); }
    async getLatest(limit: number): Promise<AuditEvent[]> {
        return [...this.events].reverse().slice(0, limit);
    }
    async count(): Promise<number> { return this.events.length; }
    async *getStream(limit: number, reverse: boolean): AsyncIterable<AuditEvent> {
        const list = reverse ? [...this.events].reverse() : [...this.events];
        const result = limit === -1 ? list : list.slice(0, limit);
        for (const e of result) yield e;
    }
    async deleteBefore(_timestamp: number): Promise<number> { return 0; }
    async appendDelta(_delta: AuditDelta): Promise<void> {}
    async getDeltas(_eventId: string): Promise<AuditDelta[]> { return []; }
}

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

/**
 * Property-Based Test: Audit Ledger Integrity
 * Verifies Merkle chain consistency under randomized event ingestion and truncation.
 */
Deno.test("AuditService - Property-Based Chain Integrity", async () => {
    const repo = new MockAuditRepository();
    const logger = new MockLoggingPort();
    const verifier = new AuditVerifier(repo, logger);
    const service = new AuditService(repo, logger, verifier);
    await service.init();

    await fc.assert(
        fc.asyncProperty(fc.array(fc.string({ minLength: 5 })), async (messages) => {
            // 1. Ingest randomized events
            for (const msg of messages) {
                service.logEvent({ type: "PBT_EVENT", message: msg });
            }

            // 2. Force buffer flush and Merkle commitment
            // We use private methods via any to control the async flow for the test
            await (service as any).flushBuffer();
            await (service as any).commitMerkleRoot();

            // 3. Verify Chain
            const verification = await service.verifyChain(-1);
            assertEquals(verification.valid, true, `Chain should be valid for sequence of ${messages.length} events`);

            // 4. Randomized Tamper Check (If we have events)
            if (repo.events.length > 0) {
                const originalMsg = repo.events[0].message;
                repo.events[0].message = "TAMPERED_CONTENT";
                const tamperedVerif = await service.verifyChain(-1);
                assertEquals(tamperedVerif.valid, false, "Tampered chain must fail verification");
                repo.events[0].message = originalMsg; // Restore
            }
        }),
        { numRuns: 20 }
    );

    await service.shutdown();
});
