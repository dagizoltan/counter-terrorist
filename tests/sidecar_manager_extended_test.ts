import { assertEquals } from "@std/assert";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

Deno.test("SidecarManager - Registry validation", async () => {
    const executor = { execute: async () => ({ success: true, stdout: "", stderr: "" }) } as any;
    const logging = { log: () => Promise.resolve() } as any;
    const sm = new SidecarManager(executor, logging);

    // Test non-existent sidecar
    // Need to set config first
    sm.setConfig({ getEnv: () => "test", getToken: () => "t", getMeshSecret: () => "s", getNumber: (k, d) => d, getBoolean: (k, d) => d } as any);
    const res = await sm.runSidecar("ghost-agent" as any, []);
    assertEquals(res.success, false);
    assertEquals(res.stderr?.includes("not in the allowlist"), true);
});
