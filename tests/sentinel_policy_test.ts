import { assertEquals } from "@std/assert";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { validateRequest } from "@infrastructure/system/validation.ts";

Deno.test("SystemExecutor Sentinel Policy - KillProcess, QuarantineProcess, DumpProcess", async () => {
  const executor = new SystemExecutor();

  // 1. KillProcess
  const killPayload = JSON.stringify({ type: "KillProcess", pid: 1234 });
  const result1 = await executor.execute("sentinel", [killPayload]);
  assertEquals(result1.stderr.includes("Security Violation"), false, "KillProcess should be allowed by SystemExecutor regex");

  // 2. QuarantineProcess
  const quarantinePayload = JSON.stringify({ type: "QuarantineProcess", pid: 1234 });
  const result2 = await executor.execute("sentinel", [quarantinePayload]);
  assertEquals(result2.stderr.includes("Security Violation"), false, "QuarantineProcess should be allowed by SystemExecutor regex");

  // 3. DumpProcess
  const dumpPayload = JSON.stringify({ type: "DumpProcess", pid: 1234, path: "./volume/storage/forensics/dump.bin" });
  const result3 = await executor.execute("sentinel", [dumpPayload]);
  assertEquals(result3.stderr.includes("Security Violation"), false, "DumpProcess should be allowed by SystemExecutor regex");
});

Deno.test("validateRequest - Sentinel Command Validation", () => {
  // Valid commands
  assertEquals(validateRequest("sentinel", { type: "KillProcess", pid: 1234 }), true);
  assertEquals(validateRequest("sentinel", { type: "QuarantineProcess", pid: 1234 }), true);
  assertEquals(validateRequest("sentinel", { type: "DumpProcess", pid: 1234, path: "./volume/storage/forensics/dump.bin" }), true);
  assertEquals(validateRequest("sentinel", { type: "TRUST_PID", pid: 5678 }), true, "TrustPid with valid pid should pass validation");

  // Invalid PID type
  assertEquals(validateRequest("sentinel", { type: "KillProcess", pid: "1234" }), false, "KillProcess with string PID should fail");

  // Invalid path for DumpProcess (traversal)
  assertEquals(validateRequest("sentinel", { type: "DumpProcess", pid: 1234, path: "./volume/storage/../../etc/passwd" }), false, "DumpProcess with traversal path should fail");
});
