import { assertEquals } from "@std/assert";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

Deno.test("SystemExecutor - Enhanced Pattern Protection", async () => {
    const executor = new SystemExecutor();

    // Should allow paths but block metacharacters
    const res1 = (executor as any).validateSensitiveArgument("/var/lib/cts/allowed", "ls");
    assertEquals(res1.valid, true, "Valid path should be allowed");

    const res2 = (executor as any).validateSensitiveArgument("/tmp/test; rm -rf /", "ls");
    assertEquals(res2.valid, false, "Metacharacter in path should be blocked");

    const res3 = (executor as any).validateSensitiveArgument("user@[2001:db8::1]:/remote/path", "scp");
    assertEquals(res3.valid, true, "IPv6 remote path should be allowed");

    const res4 = (executor as any).validateSensitiveArgument("user@host:;whoami", "scp");
    assertEquals(res4.valid, false, "Command chain in remote path should be blocked");
});
