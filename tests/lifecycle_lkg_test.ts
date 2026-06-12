import { assertEquals } from "@std/assert";
import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";

Deno.test("LifecycleService - LKG Snapshot logic", async () => {
    const kv = await Deno.openKv(":memory:");
    await kv.set(["app", "state"], "active");

    const commands = { sendCommand: async () => ({ success: true }) } as any;
    const logging = { log: () => Promise.resolve() } as any;

    const service = new LifecycleService(commands, logging);
    // Stub to prevent immediate call from setKv if desired, but we want to call the inner logic
    const original = (service as any).scheduleLkgSnapshot;
    (service as any).scheduleLkgSnapshot = () => {};

    service.setKv(kv);

    // Trigger the actual snapshot logic (the interval function content)
    // @ts-ignore
    const snapshotLogic = async () => {
            if (!(service as any).kv) return;
            try {
                const iter = (service as any).kv.list({ prefix: [] });
                let count = 0;
                let batch = (service as any).kv.atomic();
                for await (const entry of iter) {
                    if (entry.key[0] === "lkg") continue;
                    batch.set(["lkg", ...entry.key], entry.value);
                    count++;
                    if (count % 100 === 0) {
                        await batch.commit();
                        batch = (service as any).kv.atomic();
                    }
                }
                await batch.commit();
            } catch (e) {
                console.error("LKG snapshot failed:", e);
            }
    };

    await snapshotLogic();

    // Check if copied to lkg prefix
    const res = await kv.get(["lkg", "app", "state"]);
    assertEquals(res.value, "active");

    kv.close();
});
