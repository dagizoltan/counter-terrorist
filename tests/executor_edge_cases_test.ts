import { assertEquals } from "@std/assert";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";

Deno.test("SystemExecutor - SSH Hardening (Flags and Redirection)", async () => {
    const executor = new SystemExecutor();

    // Test: Block ProxyCommand (potential RCE/Tunneling)
    const result1 = await executor.execute("ssh", ["-o", "ProxyCommand=nc -x 1.2.3.4 %h %p", "user@host"]);
    assertEquals(result1.success, false);
    assertEquals(result1.stderr.includes("Invalid -o value for ssh"), true);

    // Test: Block -i flag (Identity file) - NEWLY HARDENED
    // We expect it to fail structured validation
    const result2 = await executor.execute("ssh", ["-i", "/home/user/.ssh/id_rsa", "user@host"]);
    assertEquals(result2.success, false);
    assertEquals(result2.stderr.includes("Unauthorized flag: -i") || result2.stderr.includes("Argument '-i' at index 0 is not allowed"), true);

    // Test: Block -F flag (Custom config file)
    const result3 = await executor.execute("ssh", ["-F", "/tmp/malicious_config", "user@host"]);
    assertEquals(result3.success, false);
    assertEquals(result3.stderr.includes("Unauthorized flag: -F"), true);

    // Test: Block shell redirection in command
    const result4 = await executor.execute("ssh", ["user@host", "cat /etc/shadow > /tmp/exfil"]);
    assertEquals(result4.success, false);
    // Framework-level check might trigger first with generic message
    assertEquals(result4.stderr.includes("Unauthorized argument") ||
                 result4.stderr.includes("blocked sequence: '>'") ||
                 result4.stderr.includes("Shell metacharacter detected"), true);
});

Deno.test("SystemExecutor - PowerShell Hardening (Sub-expressions and Chaining)", async () => {
    const executor = new SystemExecutor();

    // Test: Block sub-expression $(...)
    const result1 = await executor.execute("powershell", ["-Command", "Write-Output $(whoami)"]);
    assertEquals(result1.success, false);
    // Framework-level check might trigger first with generic message
    assertEquals(result1.stderr.includes("Security Violation: PowerShell sub-expressions are forbidden") ||
                 result1.stderr.includes("Shell metacharacter detected"), true);

    // Test: Block script block { }
    const result2 = await executor.execute("powershell", ["-Command", "Invoke-Command { Get-Process }"]);
    assertEquals(result2.success, false);
    assertEquals(result2.stderr.includes("Security Violation: PowerShell command contains blocked character: {") ||
                 result2.stderr.includes("Security Violation: PowerShell command contains blocked character: {"), true); // Redundant but safe

    // Test: Block command chaining ;
    const result3 = await executor.execute("powershell", ["-Command", "Get-Service; whoami"]);
    assertEquals(result3.success, false);
    assertEquals(result3.stderr.includes("Security Violation: PowerShell command contains blocked character: ;") ||
                 result3.stderr.includes("Shell metacharacter detected"), true);
});

Deno.test("SystemExecutor - systemctl Hardening (Service Whitelist)", async () => {
    const executor = new SystemExecutor();

    // Test: Block unauthorized service
    const result1 = await executor.execute("systemctl", ["restart", "apache2"]);
    assertEquals(result1.success, false);
    assertEquals(result1.stderr.includes("Unauthorized service: apache2"), true);

    // Test: Allow cts service
    const result2 = await executor.execute("systemctl", ["status", "cts-enforcer"]);
    // It might fail to execute because of sudo -n but it should pass structured validation
    assertEquals(result2.stderr.includes("Structured validation failed"), false);
});
