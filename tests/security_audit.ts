
import { validatePath, validateRequest, SidecarName } from "../src/orchestrator/infrastructure/system/validation.ts";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("Security Audit: validatePath should enforce jail if provided", () => {
    const jail = ["./volume/"];

    // Normal case
    assertEquals(validatePath("./volume/test.txt", jail), true);

    // Traversal attempt
    assertEquals(validatePath("./volume/../etc/passwd", jail), false);

    // Prefix bypass attempt (B-09)
    assertEquals(validatePath("./volume-sensitive/exploit.txt", jail), false);

    // Encoding bypass attempt
    assertEquals(validatePath("%2e%2e%2fetc%2fpasswd", jail), false);
});

Deno.test("Security Audit: validateRequest for analyzer should enforce jail", () => {
    const sidecar: SidecarName = "analyzer";

    const maliciousReq = {
        type: "ScanPath",
        path: "/etc/shadow"
    };

    const isValid = validateRequest(sidecar, maliciousReq);
    assertEquals(isValid, false, "Analyzer should not be allowed to scan /etc/shadow");
});

Deno.test("Security Audit: SystemExecutor openssl policy should block arbitrary file access", async () => {
    const executor = new SystemExecutor();

    const res = await executor.execute("openssl", ["dgst", "-sha256", "/etc/passwd"]);
    assertEquals(res.success, false, "Openssl should not be allowed to hash /etc/passwd");
    assertEquals(res.stderr.includes("Security Violation"), true, "Should report Security Violation");
});

Deno.test("Security Audit: SystemExecutor sentinel JSON injection with path traversal", async () => {
    const executor = new SystemExecutor();

    const maliciousJson = JSON.stringify({
        id: crypto.randomUUID(),
        type: "DumpProcess",
        pid: 123,
        path: "./volume/../../etc/passwd"
    });

    const res = await executor.execute("sentinel", [maliciousJson]);
    assertEquals(res.success, false, "Sentinel should not allow path traversal in JSON payload");
    assertEquals(res.stderr.includes("Security Violation"), true, "Should report Security Violation for JSON path");
});

Deno.test("Security Audit: SystemExecutor should block prefix bypass for openssl", async () => {
    const executor = new SystemExecutor();

    const res = await executor.execute("openssl", ["dgst", "-sha256", "./volume-sensitive/secret.key"]);
    assertEquals(res.success, false, "Openssl should not allow prefix bypass");
    assertEquals(res.stderr.includes("Security Violation"), true);
});

Deno.test("Security Audit: SystemExecutor should allow valid openssl operations", async () => {
    const executor = new SystemExecutor();

    // Ensure file exists for real execution check if we wanted,
    // but here we mainly care about validation.
    // If it fails with 'entity not found' it's fine, as long as it's not 'Security Violation'
    const res = await executor.execute("openssl", ["dgst", "-sha256", "./volume/storage/test.bin"]);
    const isSecurityViolation = res.stderr.includes("Security Violation");
    assertEquals(isSecurityViolation, false, "Valid openssl path should not trigger Security Violation");
});
