import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ProvisioningService } from "../src/orchestrator/domain/orchestration/provisioning_service.ts";

Deno.test("ProvisioningService - discoverTargets", async () => {
    const sidecar = {
        runSidecar: async (name: string, args: string[]) => {
            return {
                success: true,
                data: [{ ip: "192.168.1.50", port: 22 }, { ip: "192.168.1.60", port: 5985 }]
            };
        }
    } as any;

    const mesh = {} as any;
    const executor = {} as any;
    const logging = { log: () => {} } as any;
    const config = { getEnv: (k: string) => undefined, getBoolean: () => false, getToken: () => undefined } as any;

    const service = new ProvisioningService(sidecar, mesh, executor, logging, config);
    await service.discoverTargets();

    // Verify targets were added
    const targets = (service as any).targets;
    assertEquals(targets.size, 2);
    assertEquals(targets.has("192.168.1.50"), true);
    assertEquals(targets.get("192.168.1.50").os, "linux");
});

Deno.test("ProvisioningService - aborts if secrets missing", async () => {
    const sidecar = {} as any;
    const mesh = {} as any;
    const executor = {} as any;
    let logs: any[] = [];
    const logging = { log: (e: any) => logs.push(e) } as any;
    const config = { getEnv: (k: string) => undefined, getBoolean: () => false, getToken: () => undefined } as any;

    const service = new ProvisioningService(sidecar, mesh, executor, logging, config);

    // We need to trick it into having a target
    // Since targets is private, we'll call discoverTargets with a mock
    const mockSidecar = {
        runSidecar: async () => ({ success: true, data: [{ ip: "1.1.1.1", port: 22 }] })
    };
    const service2 = new ProvisioningService(mockSidecar as any, mesh, executor, logging, config);
    await service2.discoverTargets();
    await service2.provisionTarget("1.1.1.1");

    assertEquals(logs.some(l => l.message.includes("PROVISIONING ABORTED")), true);
});

Deno.test("ProvisioningService - shutdown stops loop", async () => {
    const sidecar = {
        runSidecar: async () => ({ success: true, data: [] })
    } as any;
    const mesh = {} as any;
    const executor = {} as any;
    const logging = { log: () => {} } as any;
    const config = {
        getEnv: (k: string) => k === "PROVISIONING_ENABLED" ? "true" : undefined,
        getBoolean: () => false,
        getToken: () => undefined
    } as any;

    const service = new ProvisioningService(sidecar, mesh, executor, logging, config);

    const runPromise = service.run();

    // Give it a moment to start
    await new Promise(r => setTimeout(r, 100));

    await service.shutdown();

    // The run loop should exit fairly quickly now
    await runPromise;
});
