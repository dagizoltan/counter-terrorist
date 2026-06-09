import { assertEquals } from "@std/assert";
import fc from "npm:fast-check";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { AuditRepository } from "../src/orchestrator/domain/repositories/audit_repository.ts";

class MockAuditRepo implements AuditRepository {
  public events: any[] = [];
  async save(event: any) { this.events.push(event); }
  async saveMany(events: any[]) { this.events.push(...events); }
  async getLatest(limit: number) { return this.events.slice(-limit).reverse(); }
  async count() { return this.events.length; }
  async deleteBefore() { return 0; }
  async *getStream(limit: number, reverse: boolean) {
    const slice = [...this.events].slice(0, limit);
    if (reverse) slice.reverse();
    for (const e of slice) yield e;
  }
}

Deno.test("Audit Ledger - Property-Based Hash Chain Integrity", async () => {
    const repo = new MockAuditRepo();
    const service = new AuditService(repo as any, { log: () => Promise.resolve() } as any);
    (service as any).initialized = true;

    await fc.assert(
        fc.asyncProperty(
            fc.array(fc.record({
                type: fc.string({ minLength: 1 }),
                message: fc.string({ minLength: 1 }),
                severity: fc.string(),
                caller: fc.string()
            }), { minLength: 1, maxLength: 20 }),
            async (events) => {
                repo.events = [];
                (service as any).lastHash = "GENESIS";
                (service as any).auditBuffer = [];
                // Reset logQueue and state just in case
                (service as any).logQueue = [];
                (service as any).isProcessingQueue = false;

                for (const e of events) {
                    service.logEvent(e as any);
                }

                // Wait for async queue processing
                let attempts = 0;
                while (((service as any).logQueue.length > 0 || (service as any).isProcessingQueue) && attempts < 50) {
                    await new Promise(r => setTimeout(r, 10));
                    attempts++;
                }

                await (service as any).flushBuffer();

                const status = await service.getChainStatus();
                assertEquals(status.count, events.length, "Event count mismatch in property test");

                const verification = await service.verifyFullChain();
                return verification.valid;
            }
        ),
        { numRuns: 30 }
    );
});
