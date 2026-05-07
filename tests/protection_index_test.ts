import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("createProtection returns a Protection object with all managers", () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const protection = createProtection(sidecar, executor, platform, null as any);

  assertEquals(typeof protection.firewall, "object");
  assertEquals(typeof protection.vpn, "object");
  assertEquals(typeof protection.antivirus, "object");
  assertEquals(typeof protection.persistence, "object");
  assertEquals(typeof protection.pcap, "object");
  assertEquals(typeof protection.rkhunter, "object");
});
