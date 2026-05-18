import { CommandPort } from "@core/ports.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts";

class MockCommandPort implements CommandPort {
    async sendCommand(sidecar: string, command: any): Promise<any> {
        if (sidecar === "analyzer" && command.type === "Quarantine") {
            if (command.path === "tests/non-regular-file.txt") {
                return { success: false, stderr: "Target is not a regular file." };
            }
            return { success: true, data: { target: "/tmp/quarantined_file" }, stdout: "Success" };
        }
        return { success: true };
    }
    onEvent(): void {}
    emitEvent(): void {}
    async getPersistentSidecar(): Promise<any> { return {}; }
    isRunning(): boolean { return true; }
    async restartSidecar(): Promise<void> {}
    async stopSidecar(): Promise<void> {}
    getPID(): number | null { return 123; }
}

Deno.test("UbuntuAntivirusProvider.quarantine - Security Fix Verification", async () => {
  const commandPort = new MockCommandPort();
  const provider = new UbuntuAntivirusProvider(commandPort as any);
  const testFile = "tests/security_test_file.txt";
  const nonRegularFile = "tests/non-regular-file.txt";

  // Test 1: Handle non-regular files securely
  const result1 = await provider.quarantine(nonRegularFile);
  assertEquals(result1.success, false, "Should fail for non-regular file");
  assertEquals(result1.message, "Target is not a regular file.", "Error message should match");

  // Test 2: Successful quarantine
  const result2 = await provider.quarantine(testFile);
  assertEquals(result2.success, true, "Should succeed for regular file");
  assertEquals(result2.target, "/tmp/quarantined_file");
});
