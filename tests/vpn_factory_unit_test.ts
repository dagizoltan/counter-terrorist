import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createVpnManager } from "../orchestrator/protection/factory.ts";
import { SidecarManager } from "../orchestrator/infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../orchestrator/infrastructure/system_executor.ts";
import { PlatformInfo } from "../orchestrator/infrastructure/platform.ts";
import { CommandResult } from "../orchestrator/infrastructure/command_manager.ts";

class MockExecutor extends SystemExecutor {
  calls: Array<{ cmd: string; args: string[] }> = [];
  responses: Record<string, CommandResult> = {};

  override async execute(cmd: string, args: string[] = []): Promise<CommandResult> {
    this.calls.push({ cmd, args });

    if (this.responses[cmd]) {
        return this.responses[cmd];
    }

    return { success: true, stdout: "", stderr: "" };
  }

  get lastCmd() {
    return this.calls[this.calls.length - 1]?.cmd || "";
  }

  get lastArgs() {
    return this.calls[this.calls.length - 1]?.args || [];
  }
}

Deno.test("VpnFactory - createVpnManager should return WindowsVpnProvider for Windows", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createVpnManager(sidecar, executor, platform);

  // Trigger a call that is unique to WindowsVpnProvider
  await manager.connect("wg-test");
  // WindowsVpnProvider uses 'wireguard.exe'
  assertEquals(executor.lastCmd, "wireguard.exe");
});

Deno.test("VpnFactory - createVpnManager should return UbuntuVpnProvider for Ubuntu", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  // UbuntuVpnProvider checks 'which wg-quick'
  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg-test");
  // UbuntuVpnProvider uses 'wg-quick' after 'which'
  assertEquals(executor.lastCmd, "wg-quick");
});

Deno.test("VpnFactory - createVpnManager should default to UbuntuVpnProvider for MacOS", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "macos", version: "15", tag: "macos_15" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg-test");
  assertEquals(executor.lastCmd, "wg-quick");
});

Deno.test("VpnFactory - createVpnManager should default to UbuntuVpnProvider for Unknown", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "unknown", version: "unknown", tag: "unknown" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg-test");
  assertEquals(executor.lastCmd, "wg-quick");
});
