import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createProtection } from "../orchestrator/protection/index.ts";
import { SidecarManager } from "../orchestrator/infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../orchestrator/infrastructure/system_executor.ts";
import { PlatformInfo } from "../orchestrator/infrastructure/platform.ts";
import { CommandResult } from "../orchestrator/infrastructure/command_manager.ts";

class MockExecutor extends SystemExecutor {
  override async execute(_cmd: string, _args: string[] = []): Promise<CommandResult> {
    return { success: true, stdout: "", stderr: "" };
  }
}

Deno.test("createProtection returns a Protection object with all managers", () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const protection = createProtection(sidecar, executor, platform);

  assertEquals(typeof protection.firewall, "object");
  assertEquals(typeof protection.vpn, "object");
  assertEquals(typeof protection.antivirus, "object");
  assertEquals(typeof protection.persistence, "object");
  assertEquals(typeof protection.pcap, "object");
  assertEquals(typeof protection.rkhunter, "object");
});
