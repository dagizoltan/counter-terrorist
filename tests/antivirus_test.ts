import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AntivirusManager } from "@infrastructure/system/protection/antivirus/antivirus.ts";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

const antivirus = new AntivirusManager(new UbuntuAntivirusProvider(new SidecarManager(new SystemExecutor(), loggingService as any)));

Deno.test("AntivirusManager.scanPath validation", async () => {
  // Test allowed paths
  const result1 = await antivirus.scanPath("/tmp/safe.txt");
  // It might fail because clamscan is not installed, but it should NOT fail due to path validation
  if (result1.success || !result1.error.message.includes("outside allowed boundaries")) {
      console.log("Allowed /tmp/safe.txt - OK");
  } else {
      throw new Error("Failed to allow /tmp/safe.txt: " + result1.error.message);
  }

  // Test bypass attempts
  const result2 = await antivirus.scanPath("/tmp-malicious/file.txt");
  assertEquals(!result2.success && result2.error.message.includes("outside allowed boundaries"), true);
  console.log("Blocked /tmp-malicious/file.txt - OK");

  const result3 = await antivirus.scanPath("/etc/passwd");
  assertEquals(!result3.success && result3.error.message.includes("outside allowed boundaries"), true);
  console.log("Blocked /etc/passwd - OK");
});
