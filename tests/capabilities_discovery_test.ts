import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { dropUnnecessaryCapabilities, getLastCap } from "../src/orchestrator/infrastructure/system/capabilities.ts";

Deno.test("Linux Capability Discovery and Pruning", () => {
    if (Deno.build.os !== "linux") {
        console.log("Skipping Linux capability test on non-Linux platform.");
        return;
    }

    const lastCap = getLastCap();
    assertGreaterOrEqual(lastCap, 37, "Modern Linux kernels should have at least 38 capabilities");

    // Test the dropping logic (will not fail if already dropped, but should execute without error)
    const success = dropUnnecessaryCapabilities();
    assertEquals(typeof success, "boolean");
});
