import fc from "fast-check";
import { assertEquals, assertNotEquals } from "@std/assert";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";

/**
 * Property-Based Test: SystemExecutor Fuzzing
 * Verifies that no combination of randomized input characters can bypass shell metacharacter blocking.
 */
Deno.test("SystemExecutor - Shell Metacharacter Fuzzing", async () => {
    const executor = new SystemExecutor();

    // We fuzz specifically the arguments to a path-sensitive command
    await fc.assert(
        fc.asyncProperty(fc.string(), async (fuzzedArg) => {
            // Test execute (which is where validation happens)
            const result = await executor.execute("ls", [fuzzedArg]);

            // If the argument contains a metacharacter (and isn't JSON), it MUST fail
            const METAS = /[;&|><`$()!\n\r\t]/;
            const hasMeta = METAS.test(fuzzedArg);

            // LS is path sensitive in SystemExecutor
            if (hasMeta && !fuzzedArg.startsWith("{")) {
                assertEquals(result.success, false, `Fuzzed input '${fuzzedArg}' containing metacharacter should have been blocked`);
                assertNotEquals(result.stderr.indexOf("Security Violation"), -1);
            }
        }),
        { numRuns: 1000 }
    );
});

Deno.test("SystemExecutor - Path Traversal Fuzzing", async () => {
    const executor = new SystemExecutor();

    await fc.assert(
        fc.asyncProperty(fc.string(), async (fuzzedPath) => {
             const result = await executor.execute("mkdir", [fuzzedPath]);

             // If it contains .. it MUST be blocked
             if (fuzzedPath.includes("..")) {
                 assertEquals(result.success, false, `Path '${fuzzedPath}' containing '..' should be blocked`);
             }
        }),
        { numRuns: 500 }
    );
});
