import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "@infrastructure/system/platform.ts";
import { CommandResult, CommandPort } from "@core/ports.ts";

class MockExecutor extends SystemExecutor {
  override async execute(_cmd: string, _args: string[] = []): Promise<CommandResult> {
    return { success: true, stdout: "", stderr: "" };
  }
}

class MockCommandPort implements CommandPort {
    async sendCommand(): Promise<any> { return { success: true }; }
    onEvent(): void {}
    emitEvent(): void {}
    async getPersistentSidecar(): Promise<any> { return {}; }
    isRunning(): boolean { return true; }
    async restartSidecar(): Promise<void> {}
    async stopSidecar(): Promise<void> {}
    getPID(): number | null { return 123; }
}

Deno.test("createProtection returns a Protection object with all managers", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockCommandPort();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const protection = createProtection(sidecar as any, executor, platform, null as any);

  assertEquals(typeof protection.firewall, "object");
  assertEquals(typeof protection.vpn, "object");
  assertEquals(typeof protection.antivirus, "object");
  assertEquals(typeof protection.persistence, "object");
  assertEquals(typeof protection.pcap, "object");
  assertEquals(typeof protection.rkhunter, "object");

  // Cleanup to avoid leaks
  (protection.firewall as any).shutdown?.();
  (protection.vpn as any).shutdown?.();
});
