import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

Deno.test("UbuntuAntivirusProvider.quarantine - Security Fix Verification", async () => {
  const executor = new SidecarManager(new SystemExecutor(), loggingService as any);
  const provider = new UbuntuAntivirusProvider(executor);
  const testFile = "tests/security_test_file.txt";
  const tempQuarantineDir = await Deno.makeTempDir({ prefix: "cts_quarantine_test" });

  // Set the environment variable for the provider to use
  Deno.env.set("QUARANTINE_DIR", tempQuarantineDir);

  await Deno.writeTextFile(testFile, "initial content");

  try {
    // Test 1: Handle non-regular files securely
    const statStub = stub(Deno.FsFile.prototype, "stat", async () => ({
      isFile: false,
      mtime: new Date(),
      ino: 1,
      dev: 1,
      size: 0,
    } as any));

    try {
      const result = await provider.quarantine(testFile);
      console.log("Result for non-regular file:", JSON.stringify(result, null, 2));
      assertEquals(result.success, false, "Should fail for non-regular file");
      assertEquals(result.message, "Target is not a regular file.", "Error message should match");
    } finally {
      statStub.restore();
    }

    // Test 2: Successful quarantine with metadata
    const result = await provider.quarantine(testFile);
    console.log("Result for successful quarantine:", JSON.stringify(result, null, 2));
    assertEquals(result.success, true, "Should succeed for regular file");

    if (result.target) {
        const metadataFile = `${result.target}.metadata.json`;
        const metadataContent = await Deno.readTextFile(metadataFile);
        const metadata = JSON.parse(metadataContent);
        assertEquals(metadata.originalPath, testFile);
        assertEquals(typeof metadata.ino, "number");

        // Cleanup quarantined files
        await Deno.remove(result.target);
        await Deno.remove(metadataFile);
    }

  } finally {
    try { await Deno.remove(testFile); } catch { /* ignore */ }
    try { await Deno.remove(tempQuarantineDir, { recursive: true }); } catch { /* ignore */ }
    Deno.env.delete("QUARANTINE_DIR");
  }
});
