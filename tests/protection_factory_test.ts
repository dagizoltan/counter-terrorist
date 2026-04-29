import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createVpnManager } from "../orchestrator/protection/factory.ts";
import { SidecarManager } from "../orchestrator/infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../orchestrator/infrastructure/system_executor.ts";
import { PlatformInfo } from "../orchestrator/infrastructure/platform.ts";
import { CommandResult } from "../orchestrator/infrastructure/command_manager.ts";

class MockExecutor extends SystemExecutor {
  lastCmd: string = "";
  lastArgs: string[] = [];
  responses: Record<string, CommandResult> = {};

  override async execute(cmd: string, args: string[] = []): Promise<CommandResult> {
    this.lastCmd = cmd;
    this.lastArgs = args;

    if (this.responses[cmd]) {
        return this.responses[cmd];
    }

    return { success: true, stdout: "", stderr: "" };
  }
}

Deno.test("createVpnManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createVpnManager(sidecar, executor, platform);

  // Verify it uses WindowsVpnProvider by checking the command it executes
  await manager.connect("test-wg");
  assertEquals(executor.lastCmd, "wireguard.exe");
  assertEquals(executor.lastArgs, ["/installservice", "test-wg"]);
});

Deno.test("createVpnManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  // UbuntuVpnProvider first checks if wg-quick exists
  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("test-wg");
  // The last command should be wg-quick after the which check
  assertEquals(executor.lastCmd, "wg-quick");
  assertEquals(executor.lastArgs, ["up", "test-wg"]);
});

Deno.test("createVpnManager - Default to Ubuntu for other platforms", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "macos", version: "15", tag: "macos_15" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg0");
  assertEquals(executor.lastCmd, "wg-quick");
});
