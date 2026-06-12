import { assertEquals } from "jsr:@std/assert";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

Deno.test("SystemExecutor - IPv6 Remote Path Validation", async () => {
    const executor = new SystemExecutor();

    // Valid IPv6 SCP target
    // @ts-ignore
    const validResult = executor.validateSensitiveArgument("user@[2001:db8::1]:/path/to/file", "scp");
    assertEquals(validResult.valid, true);

    // Malicious IPv6 SCP target with shell metacharacters
    // @ts-ignore
    const invalidResult = executor.validateSensitiveArgument("user@[2001:db8::1]:/path/to/file;rm -rf /", "scp");
    assertEquals(invalidResult.valid, false);
    assertEquals(invalidResult.reason?.includes("Shell metacharacters"), true);

    // Another one with backticks
    // @ts-ignore
    const invalidResult2 = executor.validateSensitiveArgument("user@[::1]:`whoami`", "ssh");
    assertEquals(invalidResult2.valid, false);
});
