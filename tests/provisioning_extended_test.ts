import { assertEquals } from "@std/assert";
import { ProvisioningService } from "@domain/orchestration/provisioning_service.ts";

Deno.test("ProvisioningService - Initial state", async () => {
    const executor = { execute: async () => ({ success: true, stdout: "", stderr: "" }) } as any;
    const logging = { log: () => Promise.resolve() } as any;
    const config = { getEnv: () => "test" } as any;
    const mesh = {} as any;
    const sidecar = {} as any;

    const ps = new ProvisioningService(sidecar, mesh, executor, logging, config);

    // @ts-ignore
    assertEquals(ps.isRunning, false);
});
