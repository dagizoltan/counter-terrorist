import { assertEquals } from "@std/assert";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "@infrastructure/system/platform.ts";
import { CommandResult } from "@core/ports.ts";

class MockExecutor extends SystemExecutor {
  override async execute(_cmd: string, _args: string[] = []): Promise<CommandResult> {
    return { success: true, stdout: "", stderr: "" };
  }
}

Deno.test({
  name: "createProtection returns a Protection object with all managers",
  sanitizeOps: false,
  sanitizeResources: false,
  sanitizeSignals: false,
  fn: async () => {
  const executor = new MockExecutor();
  const mockLogging = { log: () => Promise.resolve() } as any;
  const sidecar = new SidecarManager(executor, mockLogging);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  try {
      const protection = createProtection(sidecar, executor, platform, null as any);

      assertEquals(typeof protection.firewall, "object");
      assertEquals(typeof protection.vpn, "object");
      assertEquals(typeof protection.antivirus, "object");
      assertEquals(typeof protection.persistence, "object");
      assertEquals(typeof protection.pcap, "object");
      assertEquals(typeof protection.rkhunter, "object");

      // Cleanup to prevent leaks
      if ((protection.firewall as any).shutdown) (protection.firewall as any).shutdown();
      if ((protection.vpn as any).shutdown) (protection.vpn as any).shutdown();
  } finally {
      await sidecar.shutdown();
  }
}});
