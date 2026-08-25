import { assertEquals } from "@std/assert";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";

Deno.test("SystemExecutor - Blocked commands (whitelist)", async () => {
    const executor = new SystemExecutor();

    // Command not in whitelist
    const result = await executor.execute("curl", ["https://google.com"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Command 'curl' is not in the system whitelist."), true);
});

Deno.test("SystemExecutor - Shell escapes (whitelist exclusion)", async () => {
    const executor = new SystemExecutor();

    // bash should be blocked (it was removed from whitelist in previous hardening)
    const result = await executor.execute("bash", ["-c", "whoami"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Security Violation: Command 'bash' is not in the system whitelist."), true);
});

Deno.test("SystemExecutor - Argument policy violation", async () => {
    const executor = new SystemExecutor();

    // systemctl is whitelisted, but only for specific commands and services
    // Trying to start a non-cts service should fail
    const result = await executor.execute("systemctl", ["start", "nginx"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Structured validation failed for 'systemctl'"), true);
});

Deno.test("SystemExecutor - Path traversal detection", async () => {
    const executor = new SystemExecutor();

    // mkdir is allowed in ./volume/, but traversal should be caught
    const result = await executor.execute("mkdir", ["-p", "./volume/../../etc/passwd"]);
    assertEquals(result.success, false);
    // Note: Since mkdir now uses structured schema validation, it returns a schema error message
    assertEquals(result.stderr.includes("Unauthorized path: ./volume/../../etc/passwd"), true);
});

Deno.test("SystemExecutor - Too many arguments", async () => {
    const executor = new SystemExecutor();

    // which allows 1 arg via Zod max(1)
    const result = await executor.execute("which", ["ls", "grep"]);
    assertEquals(result.success, false);
    assertEquals(result.stderr.includes("Structured validation failed for 'which'"), true);
});
