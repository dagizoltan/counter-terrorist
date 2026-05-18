import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createVpnManager, createFirewallManager, createAntivirusManager, createPersistenceManager, createPcapManager } from "@infrastructure/system/protection/factory.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "@infrastructure/system/platform.ts";
import { CommandResult, CommandPort } from "@core/ports.ts";

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

class MockCommandPort implements CommandPort {
  sidecarCalls: Array<{ name: string; args: string[] }> = [];
  lastSentCommand: { name: string; cmd: any } | null = null;

  async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    this.sidecarCalls.push({ name, args });
    return { success: true, stdout: "", stderr: "" };
  }

  async sendCommand(name: string, cmd: string | object): Promise<CommandResult> {
    this.lastSentCommand = { name, cmd };
    return { success: true, stdout: "", stderr: "", data: { active: true } };
  }

  onEvent(_name: string, _handler: (data: any) => void): void {}
  emitEvent(_name: string, _data: any): void {}
  async getPersistentSidecar(_name: string): Promise<any> { return null; }
  isRunning(_name: string): boolean { return true; }
  async restartSidecar(_name: string): Promise<void> {}
  async stopSidecar(_name: string): Promise<void> {}
  getPID(_name: string): number | null { return 1234; }
}

Deno.test("createVpnManager - Windows platform", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createVpnManager(commandPort as any, null as any, platform);
  manager.shutdown(); // Stop metrics interval

  await manager.connect("test-wg");
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "CONNECT");
});

Deno.test("createVpnManager - Ubuntu platform", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createVpnManager(commandPort as any, null as any, platform);
  manager.shutdown();

  await manager.connect("test-wg");
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "CONNECT");
});

Deno.test("createVpnManager - Default to Ubuntu for other platforms (macos)", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "macos", version: "15", tag: "macos_15" };

  const manager = createVpnManager(commandPort as any, null as any, platform);
  manager.shutdown();

  await manager.connect("wg0");
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "CONNECT");
});

Deno.test("createVpnManager - Default to Ubuntu for unknown platform", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "unknown", version: "unknown", tag: "unknown" };

  const manager = createVpnManager(commandPort as any, null as any, platform);
  manager.shutdown();

  await manager.connect("wg0");
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "CONNECT");
});

Deno.test("createVpnManager - Full lifecycle (Windows)", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createVpnManager(commandPort as any, null as any, platform);
  manager.shutdown();

  // connect
  await manager.connect("wg0");
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "CONNECT");

  // isConnected
  await manager.isConnected();
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "GET_STATUS");

  // getStatus
  await manager.getStatus();
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "GET_STATUS");

  // disconnect
  await manager.disconnect();
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "DISCONNECT");
});

Deno.test("createVpnManager - Full lifecycle (Ubuntu)", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createVpnManager(commandPort as any, null as any, platform);
  manager.shutdown();

  // connect
  await manager.connect("wg0");
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "CONNECT");

  // isConnected
  await manager.isConnected();
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "GET_STATUS");

  // getStatus
  await manager.getStatus();
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "GET_STATUS");

  // disconnect
  await manager.disconnect();
  assertEquals(commandPort.lastSentCommand?.name, "tunnel");
  assertEquals((commandPort.lastSentCommand?.cmd as any).type, "DISCONNECT");
});

Deno.test("createFirewallManager - Windows platform", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createFirewallManager(commandPort as any, null as any, platform, null as any);
  manager.shutdown();

  await manager.blockIp("1.2.3.4");
  assertEquals(commandPort.lastSentCommand?.name, "enforcer-win");
});

Deno.test("createFirewallManager - Ubuntu platform", async () => {
  const commandPort = new MockCommandPort();
  const executor = new MockExecutor();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createFirewallManager(commandPort as any, executor, platform, null as any);
  manager.shutdown();

  await manager.blockIp("1.2.3.4");
  assertEquals(commandPort.lastSentCommand?.name, "sentinel");
});

Deno.test("createAntivirusManager", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createAntivirusManager(commandPort as any, null as any, platform);

  await manager.scanPath("/tmp/test.txt");
  assertEquals(commandPort.lastSentCommand?.name, "analyzer");
  assertEquals(commandPort.lastSentCommand?.cmd.type, "ScanPath");
});

Deno.test("createPersistenceManager - Windows platform", async () => {
  const commandPort = new MockCommandPort();
  const executor = new MockExecutor();
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11" };

  const manager = createPersistenceManager(commandPort as any, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "powershell");
});

Deno.test("createPersistenceManager - Ubuntu platform", async () => {
  const commandPort = new MockCommandPort();
  const executor = new MockExecutor();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createPersistenceManager(commandPort as any, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "ls");
});

Deno.test("createPersistenceManager - Default to Ubuntu for other platforms", async () => {
  const commandPort = new MockCommandPort();
  const executor = new MockExecutor();
  const platform: PlatformInfo = { name: "macos", version: "15", tag: "macos_15" };

  const manager = createPersistenceManager(commandPort as any, executor, platform);

  await manager.audit();
  assertEquals(executor.lastCmd, "launchctl");
});

Deno.test("createPcapManager", async () => {
  const commandPort = new MockCommandPort();
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04" };

  const manager = createPcapManager(commandPort as any, null as any, platform);

  assertEquals(manager !== undefined, true);
});
