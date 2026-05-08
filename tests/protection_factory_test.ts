import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createVpnManager, createFirewallManager, createAntivirusManager, createPersistenceManager, createPcapManager } from "@infrastructure/system/protection/factory.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "@infrastructure/system/platform.ts";
import { CommandResult } from "@core/ports.ts";

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

  override async sendCommand(name: string, _cmd: string | object): Promise<CommandResult> {
    return { success: true, stdout: "", stderr: "" };
  }
}

Deno.test("createVpnManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createVpnManager(sidecar, executor, platform);

  // Verify it uses WindowsVpnProvider by checking the command it executes
  await manager.connect("test-wg");
  assertEquals(executor.lastCmd, "wireguard.exe");
  assertEquals(executor.lastArgs, ["/installservice", "test-wg"]);
});

Deno.test("createVpnManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
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

Deno.test("createVpnManager - Default to Ubuntu for other platforms (macos)", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "macos", version: "15", tag: "macos_15" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg0");
  assertEquals(executor.lastCmd, "wg-quick");
});

Deno.test("createVpnManager - Default to Ubuntu for unknown platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "unknown", version: "unknown", tag: "unknown" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg0");
  assertEquals(executor.lastCmd, "wg-quick");
});

Deno.test("createVpnManager - Full lifecycle (Windows)", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createVpnManager(sidecar, executor, platform);

  // connect
  await manager.connect("wg0");
  assertEquals(executor.lastCmd, "wireguard.exe");

  // isConnected
  executor.responses["powershell"] = { success: true, stdout: "WireGuard Tunnel", stderr: "" };
  const connected = await manager.isConnected();
  assertEquals(connected, true);
  assertEquals(executor.lastCmd, "powershell");

  // getStatus
  await manager.getStatus();
  assertEquals(executor.lastCmd, "powershell");

  // disconnect
  const discResult = await manager.disconnect();
  assertEquals(discResult.success, false); // Windows disconnect is not fully implemented for safety as per provider code
});

Deno.test("createVpnManager - Full lifecycle (Ubuntu)", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  executor.responses["which"] = { success: true, stdout: "/usr/bin/wg-quick", stderr: "" };
  executor.responses["wg"] = { success: true, stdout: "interface: wg0", stderr: "" };

  const manager = createVpnManager(sidecar, executor, platform);

  // connect
  await manager.connect("wg0");
  assertEquals(executor.lastCmd, "wg-quick");
  assertEquals(executor.lastArgs, ["up", "wg0"]);

  // isConnected
  const connected = await manager.isConnected();
  assertEquals(connected, true);
  assertEquals(executor.lastCmd, "wg");

  // getStatus
  await manager.getStatus();
  assertEquals(executor.lastCmd, "wg");

  // disconnect
  await manager.disconnect();
  assertEquals(executor.lastCmd, "wg-quick");
  assertEquals(executor.lastArgs, ["down", "wg0"]);
});

Deno.test("createFirewallManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createFirewallManager(sidecar, executor, platform, null as any);

  await manager.blockIp("1.2.3.4");
  assertEquals(executor.lastCmd, "netsh");
  assertEquals(executor.lastArgs.some(arg => arg.includes("1.2.3.4")), true);
});

Deno.test("createFirewallManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createFirewallManager(sidecar, executor, platform, null as any);

  await manager.blockIp("1.2.3.4");
  assertEquals(sidecar.sidecarCalls.length, 1);
  assertEquals(sidecar.sidecarCalls[0].name, "blocker");
  assertEquals(sidecar.sidecarCalls[0].args[0].includes("1.2.3.4"), true);
});

Deno.test("createAntivirusManager", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);

  const manager = createAntivirusManager(sidecar, executor);

  // UbuntuAntivirusProvider uses clamscan for scanning
  await manager.scanPath("/tmp/test.txt");
  assertEquals(executor.lastCmd, "clamscan");
});

Deno.test("createPersistenceManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createPersistenceManager(sidecar, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "powershell");
  assertEquals(executor.lastArgs[0], "-EncodedCommand");
});

Deno.test("createPersistenceManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createPersistenceManager(sidecar, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "ls");
  assertEquals(executor.lastArgs.includes("/etc/cron.d"), true);
});

Deno.test("createPersistenceManager - Default to Ubuntu for other platforms", async () => {
  const executor = new MockExecutor();
  const sidecar = new SidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "macos", version: "15", tag: "macos_15" };

  const manager = createPersistenceManager(sidecar, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "ls");
});

Deno.test("createPcapManager", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);

  const manager = createPcapManager(sidecar, executor);

  // PcapManager interacts with persistent sidecar 'pcap'
  // Since we are mocking runSidecar, we can't easily test persistent sidecar interaction without more mocks
  // but we can verify the manager was created
  assertEquals(manager !== undefined, true);
});
