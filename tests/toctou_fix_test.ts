import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

Deno.test("UbuntuAntivirusProvider.quarantine - Security Fix Verification", async () => {
  const sidecar = new SidecarManager(new SystemExecutor(), loggingService as any);
  const provider = new UbuntuAntivirusProvider(sidecar);
  const testFile = "tests/security_test_file.txt";

  // Mock sendCommand to simulate sidecar behavior
  const sendCommandStub = stub(sidecar, "sendCommand", async (name: string, command: any) => {
    if (name === "scanner" && command.type === "Quarantine") {
        if (command.path === "non-regular-file") {
            return { success: false, stderr: "Target is not a regular file." };
        }
        return { success: true, data: { target: "/var/lib/cts/quarantine/test" } };
    }
    return { success: false, stderr: "Unknown command" };
  });

  try {
    // Test 1: Handle non-regular files securely (simulated by sidecar response)
    const result = await provider.quarantine("non-regular-file");
    assertEquals(result.success, false, "Should fail for non-regular file");
    assertEquals(result.message, "Target is not a regular file.", "Error message should match");

    // Test 2: Successful quarantine
    const result2 = await provider.quarantine(testFile);
    assertEquals(result2.success, true, "Should succeed for regular file");
    assertEquals(result2.target, "/var/lib/cts/quarantine/test");

  } finally {
    sendCommandStub.restore();
  }
});
