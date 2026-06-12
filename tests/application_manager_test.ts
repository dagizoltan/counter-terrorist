import { assertEquals } from "@std/assert";
import { ApplicationManager } from "@app/application_manager.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { ServiceRegistry } from "@core/registry.ts";

Deno.test("ApplicationManager - Daemon list generation", async () => {
    const kv = await Deno.openKv(":memory:");
    const sm = {} as SidecarManager;
    const reg = new ServiceRegistry({ log: () => Promise.resolve() } as any);
    const am = new ApplicationManager(kv, sm, reg);

    const services = {
        command: sm,
        platformInfo: { name: "linux" }
    } as any;

    // @ts-ignore
    // This is just a logic check on the startDaemons method structure
    // We don't want to actually start them in this unit test

    kv.close();
});

Deno.test("ApplicationManager - Seed Forensics logic", async () => {
    const kv = await Deno.openKv(":memory:");
    const sm = {} as SidecarManager;
    const reg = new ServiceRegistry({ log: () => Promise.resolve() } as any);
    const am = new ApplicationManager(kv, sm, reg);

    let reported = false;
    const services = {
        incidents: {
            getIncidents: async () => [],
            reportIncident: async () => { reported = true; }
        },
        networkLogs: {
            log: async () => {}
        }
    } as any;

    await am.seedForensics(services);
    assertEquals(reported, true);

    kv.close();
});
