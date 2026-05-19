import { assertEquals } from "@std/assert";
import { RateLimitService } from "@domain/identity/rate_limit.ts";

Deno.test("RateLimitService - Basic enforcement", async () => {
    const kv = await Deno.openKv(":memory:");
    const service = new RateLimitService(kv);

    const key = "user-1";
    const limit = 2;
    const window = 1000;

    // 1st request - allowed
    const res1 = await service.checkLimit(key, limit, window);
    assertEquals(res1.allowed, true);
    assertEquals(res1.count, 1);

    // 2nd request - allowed
    const res2 = await service.checkLimit(key, limit, window);
    assertEquals(res2.allowed, true);
    assertEquals(res2.count, 2);

    // 3rd request - blocked
    const res3 = await service.checkLimit(key, limit, window);
    assertEquals(res3.allowed, false);
    assertEquals(res3.count, 3);

    kv.close();
});

Deno.test("RateLimitService - Window reset", async () => {
    const kv = await Deno.openKv(":memory:");
    const service = new RateLimitService(kv);

    const key = "user-2";
    const limit = 1;
    const window = 50;

    await service.checkLimit(key, limit, window);
    const res1 = await service.checkLimit(key, limit, window);
    assertEquals(res1.allowed, false);

    // Wait for window to expire
    await new Promise(r => setTimeout(r, 100));

    const res2 = await service.checkLimit(key, limit, window);
    assertEquals(res2.allowed, true);
    assertEquals(res2.count, 1);

    kv.close();
});
