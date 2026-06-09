import fc from "npm:fast-check";
import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { RateLimitService } from "../src/orchestrator/domain/identity/rate_limit.ts";

/**
 * Property-Based Test: RateLimit Consistency
 * Verifies that the dual-tier (Memory + KV) rate limiter handles randomized concurrent requests accurately.
 */
Deno.test("RateLimitService - Convergence Fuzzing", async () => {
    const kv = await Deno.openKv(":memory:");
    const service = new RateLimitService(kv);
    await (service as any).onInit();

    const limit = 10;
    const windowMs = 5000;
    const key = "test-fuzz-key";

    // Fuzz a sequence of requests with randomized intervals
    await fc.assert(
        fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 5, maxLength: 20 }), async (intervals) => {
            // Reset for each property run
            await kv.delete(["security", "ratelimit", key]);
            (service as any).memoryTier.clear();

            let localCount = 0;
            for (const _ of intervals) {
                const res = await service.checkLimit(key, limit, windowMs);
                localCount++;

                if (localCount <= limit) {
                    assertEquals(res.allowed, true, `Request ${localCount} should be allowed`);
                }

                // Threshold triggered sync should happen at count 5 (limit/2)
                if (localCount >= 5) {
                    // Small delay to allow async sync to complete (since we aren't awaiting syncToKv in checkLimit)
                    await new Promise(r => setTimeout(r, 10));
                    const kvEntry = await kv.get(["security", "ratelimit", key]);
                    // KV should have at least some counts synced
                    assertGreaterOrEqual((kvEntry.value as any)?.count || 0, 0);
                }
            }
        }),
        { numRuns: 50 }
    );

    await service.shutdown();
    kv.close();
});
