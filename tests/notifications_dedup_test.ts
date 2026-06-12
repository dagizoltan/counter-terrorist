import { assertEquals } from "@std/assert";
import { NotificationService } from "@domain/analysis/notifications.ts";

Deno.test("NotificationService - Filtering logic", async () => {
    const kv = await Deno.openKv(":memory:");
    const logging = { log: () => Promise.resolve(), logLegacy: () => {} } as any;
    const ns = new NotificationService(kv, logging);

    // @ts-ignore
    ns.webhooks = [{ id: "1", name: "test", url: "https://example.com/webhook", type: "generic", enabled: true }];

    // Should return early for INFO type
    await ns.notify({ type: "INFO", message: "Should be filtered" });

    kv.close();
});
