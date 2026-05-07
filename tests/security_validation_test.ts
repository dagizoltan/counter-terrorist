import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { isValidIP, secureCompareBytes, secureCompare } from "@infrastructure/system/validation.ts";

Deno.test("Constant-time Token Comparison (secureCompare)", async () => {
  const secret = "super-secret-token";

  // Correct token
  assertEquals(await secureCompare(secret, secret), true);

  // Incorrect tokens
  assertEquals(await secureCompare("wrong-token", secret), false);
  assertEquals(await secureCompare(secret, "wrong-token"), false);

  // Edge cases
  assertEquals(await secureCompare("", secret), false);
  assertEquals(await secureCompare(undefined, secret), false);
  assertEquals(await secureCompare(secret, undefined), false);

  // Different lengths (should not leak length via timing, but should still be false)
  assertEquals(await secureCompare("short", secret), false);
  assertEquals(await secureCompare(secret + "-long", secret), false);
});

Deno.test("Constant-time Byte Comparison (secureCompareBytes)", () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 4]);
  const c = new Uint8Array([1, 2, 3, 5]);
  const d = new Uint8Array([1, 2, 3]);

  assertEquals(secureCompareBytes(a, b), true);
  assertEquals(secureCompareBytes(a, c), false);
  assertEquals(secureCompareBytes(a, d), false);
});

Deno.test("IP Validation Regex", () => {
  // Valid IPv4
  assertEquals(isValidIP("127.0.0.1"), true);
  assertEquals(isValidIP("192.168.1.1"), true);
  assertEquals(isValidIP("255.255.255.255"), true);

  // Invalid IPv4
  assertEquals(isValidIP("256.0.0.1"), false);
  assertEquals(isValidIP("1.2.3"), false);
  assertEquals(isValidIP("a.b.c.d"), false);
  assertEquals(isValidIP("1.2.3.4.5"), false);

  // Valid IPv6
  assertEquals(isValidIP("::1"), true);
  assertEquals(isValidIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), true);
  assertEquals(isValidIP("2001:db8:85a3::8a2e:370:7334"), true);

  // Invalid IPv6
  assertEquals(isValidIP("2001:db8:85a3:::8a2e:370:7334"), false);
  assertEquals(isValidIP("not an ip"), false);
});

Deno.test("SystemExecutor Security Policies", async () => {
  const executor = new SystemExecutor();

  // 1. Whitelist validation
  const result1 = await executor.execute("unauthorized_cmd", []);
  assertEquals(result1.success, false);
  assertEquals(result1.stderr.includes("Security Violation"), true);

  // 2. OpenSSL Policy (Regression for -r and dgst)
  const result2 = await executor.execute("openssl", ["dgst", "-sha256", "-r", "test.bin"]);
  // Should pass validation (it might fail execution but not security violation)
  assertEquals(result2.stderr.includes("Security Violation"), false);

  const result3 = await executor.execute("openssl", ["invalid_arg"]);
  assertEquals(result3.success, false);
  assertEquals(result3.stderr.includes("Security Violation"), true);

  // 3. EBPF Policy (Regression for TRUST_COMM)
  const validPayload = JSON.stringify({ type: "TRUST_COMM", comm: "systemd" });
  const result4 = await executor.execute("ebpf", [validPayload]);
  assertEquals(result4.stderr.includes("Security Violation"), false);

  const invalidPayload = JSON.stringify({ type: "MALICIOUS", comm: "systemd" });
  const result5 = await executor.execute("ebpf", [invalidPayload]);
  assertEquals(result5.success, false);
  assertEquals(result5.stderr.includes("Security Violation"), true);
});

