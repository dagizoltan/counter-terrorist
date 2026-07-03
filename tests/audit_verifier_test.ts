import { assertEquals } from "@std/assert";
import { AuditVerifier } from "../src/orchestrator/domain/analysis/audit_verifier.ts";
import { AuditEvent, AuditDelta } from "../src/orchestrator/domain/analysis/audit.ts";
import { AuditRepository } from "../src/orchestrator/domain/repositories/audit_repository.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";
import { computeHash } from "@core/crypto_utils.ts";

class MockAuditRepository implements AuditRepository {
    events: AuditEvent[] = [];
    async save(event: AuditEvent): Promise<void> { this.events.push(event); }
    async saveMany(events: AuditEvent[]): Promise<void> { this.events.push(...events); }
    async getLatest(limit: number): Promise<AuditEvent[]> { return this.events.slice(-limit); }
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
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> {}
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return []; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("AuditVerifier - Tampering Vectors", async () => {
    const repo = new MockAuditRepository();
    const logger = new MockLoggingPort();
    const verifier = new AuditVerifier(repo, logger);

    // 1. Create a valid chain
    const events: AuditEvent[] = [];
    let prevHash = "GENESIS";
    for (let i = 0; i < 5; i++) {
        const id = `id-${i}`;
        const timestamp = new Date().toISOString();
        const type = "TEST";
        const message = `Message ${i}`;
        const hashInput = {
            id, timestamp, type, severity: undefined,
            caller: undefined, message,
            actor: undefined, data: undefined,
            correlationId: undefined, prevHash,
        };
        const hash = await computeHash(hashInput);
        const event: AuditEvent = { id, timestamp, type, message, hash, prevHash };
        events.push(event);
        prevHash = hash;
    }
    repo.events = events;

    // Verify valid chain
    const v1 = await verifier.verifyFullChain();
    assertEquals(v1.valid, true, `Chain should be valid but got error: ${v1.brokenAt?.type}`);

    // 2. Vector: Message Tampering
    const originalMsg = repo.events[2].message;
    repo.events[2].message = "MALICIOUS";
    const v2 = await verifier.verifyFullChain();
    assertEquals(v2.valid, false);
    // When we tamper with message, hash remains same in event object but recalculation will mismatch
    assertEquals(v2.brokenAt?.type, "HASH_MISMATCH");
    repo.events[2].message = originalMsg;

    // 3. Vector: PrevHash Break
    const originalPrevHash = repo.events[3].prevHash;
    repo.events[3].prevHash = "BROKEN";
    const v3 = await verifier.verifyFullChain();
    assertEquals(v3.valid, false);
    // When we tamper with prevHash in the middle, it can trigger HASH_MISMATCH or CHAIN_BREAK
    // depending on which direction we scan. AuditVerifier scans reverse (newest first).
    // prevEvent: index 4, event: index 3.
    // prevEvent.prevHash (index 4's prevHash) should be index 3's hash.
    // If we changed index 3's prevHash, it's a HASH_MISMATCH for index 3.
    assertEquals(v3.brokenAt?.type, "HASH_MISMATCH");
    repo.events[3].prevHash = originalPrevHash;

    // 4. Vector: Unsigned Checkpoint
    repo.events.push({
        id: "id-checkpoint",
        timestamp: new Date().toISOString(),
        type: "CHECKPOINT",
        message: "Truncated boundary",
        hash: "some-hash",
        prevHash: "TRUNCATED" // This should be allowed if TPM is missing
    });

    const v4 = await verifier.verifyFullChain();
    assertEquals(v4.valid, true); // Missing TPM means it passes if prevHash is TRUNCATED

    repo.events[repo.events.length-1].prevHash = "fake-hash";
    const v5 = await verifier.verifyFullChain();
    assertEquals(v5.valid, false);
    assertEquals(v5.brokenAt?.type, "UNSIGNED_CHECKPOINT");
});
