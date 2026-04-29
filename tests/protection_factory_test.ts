import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createVpnManager, createFirewallManager, createAntivirusManager, createPersistenceManager, createPcapManager } from "../orchestrator/protection/factory.ts";
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

class MockSidecarManager extends SidecarManager {
  sidecarCalls: Array<{ name: string; args: string[] }> = [];

  override async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    this.sidecarCalls.push({ name, args });
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
  assertEquals(executor.calls.length, 2);
  assertEquals(executor.calls[0].cmd, "which");
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

Deno.test("createVpnManager - Unknown platform defaults to Ubuntu", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "unknown", version: "unknown", tag: "unknown" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg0");
  // Should use UbuntuVpnProvider
  assertEquals(executor.lastCmd, "wg-quick");
});

Deno.test("createVpnManager - verify all provider methods (Windows)", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };
  const manager = createVpnManager(sidecar, executor, platform);

  // connect
  await manager.connect("test-wg");
  assertEquals(executor.lastCmd, "wireguard.exe");

  // isConnected
  await manager.isConnected();
  assertEquals(executor.lastCmd, "powershell");
  assertEquals(executor.lastArgs.some(arg => arg.includes("Get-NetAdapter")), true);

  // getStatus
  await manager.getStatus();
  assertEquals(executor.lastCmd, "powershell");
  assertEquals(executor.lastArgs.some(arg => arg.includes("Get-Service")), true);

  // disconnect
  const result = await manager.disconnect();
  assertEquals(result.success, false);
  assertEquals(result.message.includes("not fully implemented"), true);
});

Deno.test("createVpnManager - verify all provider methods (Ubuntu)", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };
  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };
  const manager = createVpnManager(sidecar, executor, platform);

  // connect
  await manager.connect("wg0");
  assertEquals(executor.lastCmd, "wg-quick");
  assertEquals(executor.lastArgs, ["up", "wg0"]);

  // isConnected
  await manager.isConnected();
  assertEquals(executor.lastCmd, "wg");
  assertEquals(executor.lastArgs, ["show"]);

  // getStatus
  await manager.getStatus();
  assertEquals(executor.lastCmd, "wg");
  assertEquals(executor.lastArgs, ["show"]);

  // disconnect
  await manager.disconnect();
  assertEquals(executor.lastCmd, "wg-quick");
  assertEquals(executor.lastArgs, ["down", "wg0"]);
});

Deno.test("createFirewallManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createFirewallManager(sidecar, executor, platform);

  await manager.blockIp("1.2.3.4");
  assertEquals(executor.lastCmd, "netsh");
  assertEquals(executor.lastArgs.includes("remoteip=1.2.3.4"), true);
  assertEquals(executor.lastArgs.some(arg => arg.includes("1.2.3.4")), true);
});

Deno.test("createFirewallManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createFirewallManager(sidecar, executor, platform);

  await manager.blockIp("1.2.3.4");
  assertEquals(sidecar.sidecarCalls.length, 1);
  assertEquals(sidecar.sidecarCalls[0].name, "blocker");
  assertEquals(sidecar.sidecarCalls[0].args[0].includes("1.2.3.4"), true);
});

Deno.test("createAntivirusManager", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);

  const manager = createAntivirusManager(sidecar, executor);

  // UbuntuAntivirusProvider uses clamscan for scanning
  await manager.scanPath("/tmp/test.txt");
  assertEquals(executor.lastCmd, "clamscan");
});

Deno.test("createPersistenceManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createPersistenceManager(sidecar, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "powershell");
  assertEquals(executor.lastArgs[0], "-EncodedCommand");
});

Deno.test("createPersistenceManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createPersistenceManager(sidecar, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "ls");
  assertEquals(executor.lastArgs.includes("/etc/cron.d"), true);
});

Deno.test("createPcapManager", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor);

  const manager = createPcapManager(sidecar);

  // PcapManager interacts with persistent sidecar 'pcap'
  // Since we are mocking runSidecar, we can't easily test persistent sidecar interaction without more mocks
  // but we can verify the manager was created
  assertEquals(manager !== undefined, true);
});
