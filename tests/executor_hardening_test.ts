import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";

Deno.test("Executor Hardening: SSH Command Injection", async () => {
    const executor = new SystemExecutor();

    // Valid command
    const res1 = await executor.execute("ssh", ["-o", "StrictHostKeyChecking=yes", "user@host", "deno task start"]);
    // Since we are not root and it's not in privileged list, it won't actually try to run sudo here,
    // but the validation should pass.
    // However, execute() returns success:false if the command itself fails to spawn or returns non-zero.
    // We care about the validation message in stderr.

    assertEquals(res1.stderr.includes("Security Violation"), false, "Valid SSH command should not trigger security violation");

    // Injection attempt: chaining
    const res2 = await executor.execute("ssh", ["user@host", "deno task start && rm -rf /"]);
    assertEquals(res2.stderr.includes("Security Violation"), true, "SSH with && should be blocked");

    // Injection attempt: redirection
    const res3 = await executor.execute("ssh", ["user@host", "deno task start > /tmp/pwned"]);
    assertEquals(res3.stderr.includes("Security Violation"), true, "SSH with > should be blocked");

    // Injection attempt: backticks
    const res4 = await executor.execute("ssh", ["user@host", "deno task start `id`"]);
    assertEquals(res4.stderr.includes("Security Violation"), true, "SSH with backticks should be blocked");
});

Deno.test("Executor Hardening: PowerShell Command Injection", async () => {
    const executor = new SystemExecutor();

    // Valid
    const res1 = await executor.execute("powershell", ["-Command", "Get-Process"]);
    assertEquals(res1.stderr.includes("Security Violation"), false, "Valid PowerShell command should not trigger security violation");

    // Injection
    const res2 = await executor.execute("powershell", ["-Command", "Get-Process; Write-Host pwned"]);
    assertEquals(res2.stderr.includes("Security Violation"), true, "PowerShell with ; should be blocked");

    const res3 = await executor.execute("powershell", ["-Command", "Get-Process | Out-File pwned.txt"]);
    assertEquals(res3.stderr.includes("Security Violation"), true, "PowerShell with | should be blocked");
});
