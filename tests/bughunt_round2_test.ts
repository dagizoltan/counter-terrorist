/**
 * Regression tests for the second bug-hunting pass.
 *
 * Each case below fails against the code as it stood before the corresponding fix.
 */
import { assertEquals } from "@std/assert";
import { AuditService, AuditEvent, AuditDelta } from "@domain/analysis/audit.ts";
import { AuditVerifier } from "@domain/analysis/audit_verifier.ts";
import { EventBus } from "@domain/analysis/events.ts";
import { MmdbReader } from "@infrastructure/system/geoip/mmdb_reader.ts";
import { computeHash } from "@core/crypto_utils.ts";
import { LogEntry, LoggingPort } from "@core/ports.ts";

class MockAuditRepository {
    events: AuditEvent[] = [];
    save(event: AuditEvent): Promise<void> { this.events.push(event); return Promise.resolve(); }
    saveMany(events: AuditEvent[]): Promise<void> { this.events.push(...events); return Promise.resolve(); }
    getLatest(limit: number): Promise<AuditEvent[]> { return Promise.resolve([...this.events].reverse().slice(0, limit)); }
    count(): Promise<number> { return Promise.resolve(this.events.length); }
    async *getStream(limit: number, reverse: boolean): AsyncIterable<AuditEvent> {
        const list = reverse ? [...this.events].reverse() : [...this.events];
        for (const e of (limit ? list.slice(0, limit) : list)) yield e;
    }
    deleteBefore(_t: number): Promise<number> { return Promise.resolve(0); }
    appendDelta(_d: AuditDelta): Promise<void> { return Promise.resolve(); }
    getDeltas(_id: string): Promise<AuditDelta[]> { return Promise.resolve([]); }
}

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    log(entry: LogEntry): Promise<void> { this.logs.push(entry); return Promise.resolve(); }
    getRecentLogs(): Promise<LogEntry[]> { return Promise.resolve(this.logs); }
    // deno-lint-ignore no-explicit-any
    logLegacy(_m: string, _s?: any, _src?: string, _p?: any): Promise<void> { return Promise.resolve(); }
    // deno-lint-ignore no-explicit-any
    setKv(_kv: any): void {}
    shutdown(): Promise<void> { return Promise.resolve(); }
}

/** Builds an event whose self-computed hash is valid — trivial for any sender to do. */
async function forgeCheckpoint(overrides: Partial<AuditEvent> = {}): Promise<AuditEvent> {
    // deno-lint-ignore no-explicit-any
    const e: any = {
        id: "forged-checkpoint",
        timestamp: new Date().toISOString(),
        type: "CHECKPOINT",
        severity: "INFO",
        caller: "hostile-peer",
        message: "attacker-chosen chain root",
        actor: undefined,
        data: undefined,
        correlationId: undefined,
        prevHash: "TRUNCATED",
        ...overrides,
    };
    e.hash = await computeHash({
        id: e.id, timestamp: e.timestamp, type: e.type, severity: e.severity,
        caller: e.caller, message: e.message, actor: e.actor, data: e.data,
        correlationId: e.correlationId, prevHash: e.prevHash,
    });
    return e as AuditEvent;
}

// deno-lint-ignore no-explicit-any
async function auditWith(tpm?: any) {
    const repo = new MockAuditRepository();
    const log = new MockLoggingPort();
    // deno-lint-ignore no-explicit-any
    const svc = new AuditService(repo as any, log as any, new AuditVerifier(repo as any, log as any), tpm);
    await svc.init();
    await svc.logEvent({ type: "REAL", message: "a genuine local event" });
    await new Promise((r) => setTimeout(r, 250));
    return { repo, svc };
}

// ── Audit chain: signed truncation boundary ──────────────────────────────────
// A truncation boundary resets the chain head to a value the sender chose, so it is
// only acceptable with a verified hardware signature. The check used to be gated on
// `&& this.tpm`, so a node running without a TPM — a documented, supported mode —
// accepted an entirely unsigned checkpoint as its new chain root.

Deno.test("audit syncEvents - an unsigned truncation is refused when there is no TPM", async () => {
    const { repo, svc } = await auditWith(undefined);
    const head = (await svc.getChainStatus()).lastHash;

    await svc.syncEvents([await forgeCheckpoint()]);

    assertEquals((await svc.getChainStatus()).lastHash, head, "chain head must not move");
    assertEquals(repo.events.some((e) => e.id === "forged-checkpoint"), false, "must not be persisted");
    await svc.shutdown();
});

Deno.test("audit syncEvents - an unsigned truncation is refused even when a TPM is present", async () => {
    const tpm = { verify: () => Promise.resolve(true), sign: () => Promise.resolve("sig"), verifyIntegrity: () => Promise.resolve(true) };
    const { repo, svc } = await auditWith(tpm);
    const head = (await svc.getChainStatus()).lastHash;

    await svc.syncEvents([await forgeCheckpoint({ hwSignature: undefined })]);

    assertEquals((await svc.getChainStatus()).lastHash, head);
    assertEquals(repo.events.some((e) => e.id === "forged-checkpoint"), false);
    await svc.shutdown();
});

Deno.test("audit syncEvents - a truncation with an invalid signature is refused", async () => {
    const tpm = { verify: () => Promise.resolve(false), sign: () => Promise.resolve("sig"), verifyIntegrity: () => Promise.resolve(true) };
    const { repo, svc } = await auditWith(tpm);
    const head = (await svc.getChainStatus()).lastHash;

    await svc.syncEvents([await forgeCheckpoint({ hwSignature: "bogus" })]);

    assertEquals((await svc.getChainStatus()).lastHash, head);
    assertEquals(repo.events.some((e) => e.id === "forged-checkpoint"), false);
    await svc.shutdown();
});

Deno.test("audit syncEvents - a properly signed truncation is still accepted", async () => {
    const tpm = { verify: () => Promise.resolve(true), sign: () => Promise.resolve("sig"), verifyIntegrity: () => Promise.resolve(true) };
    const { repo, svc } = await auditWith(tpm);
    const checkpoint = await forgeCheckpoint({ id: "legit-checkpoint", hwSignature: "valid-signature" });

    await svc.syncEvents([checkpoint]);

    assertEquals((await svc.getChainStatus()).lastHash, checkpoint.hash, "a verified boundary may reset the head");
    assertEquals(repo.events.some((e) => e.id === "legit-checkpoint"), true);
    await svc.shutdown();
});

// ── EventBus: exactly-once dispatch ──────────────────────────────────────────
// The middleware chain finalizes on two paths — the innermost next(), and the
// error/timeout fallbacks. A middleware that called next() then threw, or simply
// outlived the 5s chain timeout, hit both and delivered every event twice.

Deno.test("EventBus - a middleware that throws after next() does not double-deliver", async () => {
    const bus = new EventBus(new MockLoggingPort());
    let delivered = 0;
    // deno-lint-ignore no-explicit-any
    bus.on("THREAT" as any, () => { delivered++; });
    // deno-lint-ignore no-explicit-any
    bus.use(async (_e: any, next: any) => { await next(); throw new Error("post-next failure"); });

    // deno-lint-ignore no-explicit-any
    await bus.publish("THREAT" as any, "one threat", { severity: "high" });
    await new Promise((r) => setTimeout(r, 100));

    assertEquals(delivered, 1);
    await bus.shutdown();
});

Deno.test("EventBus - a middleware slower than the chain timeout does not double-deliver", async () => {
    const bus = new EventBus(new MockLoggingPort());
    let delivered = 0;
    // deno-lint-ignore no-explicit-any
    bus.on("THREAT" as any, () => { delivered++; });
    // The chain timeout is 5s; this middleware deliberately outlives it and then
    // completes, which is exactly the case the timeout exists to handle.
    // deno-lint-ignore no-explicit-any
    bus.use(async (_e: any, next: any) => { await new Promise((r) => setTimeout(r, 5200)); await next(); });

    // deno-lint-ignore no-explicit-any
    await bus.publish("THREAT" as any, "one threat", { severity: "high" });
    await new Promise((r) => setTimeout(r, 6000));

    assertEquals(delivered, 1);
    await bus.shutdown();
});

Deno.test("EventBus - the ordinary path still delivers exactly once", async () => {
    const bus = new EventBus(new MockLoggingPort());
    let delivered = 0;
    // deno-lint-ignore no-explicit-any
    bus.on("THREAT" as any, () => { delivered++; });
    // deno-lint-ignore no-explicit-any
    bus.use(async (_e: any, next: any) => { await next(); });

    // deno-lint-ignore no-explicit-any
    await bus.publish("THREAT" as any, "one threat", { severity: "high" });
    await new Promise((r) => setTimeout(r, 100));

    assertEquals(delivered, 1);
    await bus.shutdown();
});

// ── mmdb: malformed database handling ────────────────────────────────────────
// A .mmdb is third-party data the operator provisions, so a corrupt or hostile file
// must fail closed rather than exhaust the stack on a cyclic pointer.

/**
 * Minimal mmdb whose search tree resolves to a data-section pointer that targets
 * itself. nodeCount=1 with 24-bit records gives nodeByteSize=6 and searchTreeSize=6,
 * so a record value of 17 maps to data offset 0 (17 - 1 + 6 = 22 = dataSectionStart).
 */
function cyclicPointerDb(): Uint8Array {
    const marker = [0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63, 0x6f, 0x6d];
    const p: number[] = [];
    p.push(0x00, 0x00, 17, 0x00, 0x00, 17);   // both records resolve to data offset 0
    p.push(...new Array(16).fill(0));          // data section separator
    p.push(0x20, 0x00);                        // data offset 0: pointer -> target 0 -> itself
    p.push(...marker);
    const str = (v: string) => [0x40 | v.length, ...new TextEncoder().encode(v)];
    p.push(0xe5);
    p.push(...str("node_count"), 0xa1, 1);
    p.push(...str("record_size"), 0xa1, 24);
    p.push(...str("ip_version"), 0xa1, 4);
    p.push(...str("database_type"), ...str("Test"));
    p.push(...str("build_epoch"), 0xa1, 0);
    return new Uint8Array(p);
}

Deno.test("MmdbReader - a self-referential pointer fails closed instead of exhausting the stack", () => {
    const reader = MmdbReader.fromBuffer(cyclicPointerDb());
    assertEquals(reader.metadata.nodeCount, 1, "fixture should parse as a 1-node database");

    let message = "";
    try {
        reader.lookup("1.2.3.4");
    } catch (e) {
        message = (e as Error).message;
    }
    // Must be our explicit guard, not a RangeError from a blown stack.
    assertEquals(message, "mmdb: decode nesting exceeded — malformed database");
});
