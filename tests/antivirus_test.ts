import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { assertEquals } from "@std/assert";
import { AntivirusManager } from "@infrastructure/system/protection/antivirus/antivirus.ts";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

const antivirus = new AntivirusManager(new UbuntuAntivirusProvider(new SidecarManager(new SystemExecutor(), loggingService as any)));

Deno.test({
  name: "AntivirusManager.scanPath validation",
  sanitizeOps: false,
  sanitizeResources: false,
  sanitizeExit: false,
  fn: async () => {
  // Test allowed paths
  const result1 = await antivirus.scanPath("/tmp/safe.txt");

  if (result1.success) {
      console.log("Allowed /tmp/safe.txt - OK");
  } else {
      if (!result1.error.message.includes("outside allowed boundaries")) {
          console.log("Allowed /tmp/safe.txt (Scan failed/unavailable) - OK");
      } else {
          throw new Error("Failed to allow /tmp/safe.txt: " + result1.error.message);
      }
  }

  // Test bypass attempts
  const result2 = await antivirus.scanPath("/tmp-malicious/file.txt");
  assertEquals(result2.success, false);
  if (!result2.success) {
      assertEquals(result2.error.message.includes("outside allowed boundaries"), true);
      console.log("Blocked /tmp-malicious/file.txt - OK");
  }

  const result3 = await antivirus.scanPath("/etc/passwd");
  assertEquals(result3.success, false);
  if (!result3.success) {
      assertEquals(result3.error.message.includes("outside allowed boundaries"), true);
      console.log("Blocked /etc/passwd - OK");
  }
  }
});
