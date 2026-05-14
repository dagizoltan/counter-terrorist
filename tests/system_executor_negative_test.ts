import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";

Deno.test("SystemExecutor - Blocked commands (whitelist)", async () => {
    const executor = new SystemExecutor();

    // Command not in whitelist
    const result = await executor.execute("rm", ["-rf", "/"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Command 'rm' is not whitelisted."), true);
});

Deno.test("SystemExecutor - Shell escapes (whitelist exclusion)", async () => {
    const executor = new SystemExecutor();

    // bash should be blocked (it was removed from whitelist in previous hardening)
    const result = await executor.execute("bash", ["-c", "whoami"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Command 'bash' is not whitelisted."), true);
});

Deno.test("SystemExecutor - Argument policy violation", async () => {
    const executor = new SystemExecutor();

    // systemctl is whitelisted, but only for specific commands and services
    // Trying to start a non-cts service should fail
    const result = await executor.execute("systemctl", ["start", "nginx"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Argument 'nginx' at index 1 is not allowed for 'systemctl'"), true);
});

Deno.test("SystemExecutor - Path traversal detection", async () => {
    const executor = new SystemExecutor();

    // mkdir is allowed in ./volume/, but traversal should be caught
    const result = await executor.execute("mkdir", ["-p", "./volume/../../etc/passwd"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Path traversal or prefix bypass detected in argument './volume/../../etc/passwd'"), true);
});

Deno.test("SystemExecutor - Too many arguments", async () => {
    const executor = new SystemExecutor();

    // which allows 1 arg
    const result = await executor.execute("which", ["ls", "grep"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Too many arguments for 'which' (max: 1)"), true);
});
