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
  lastSentCommand: { name: string; cmd: any } | null = null;

  override async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    this.sidecarCalls.push({ name, args });
    return { success: true, stdout: "", stderr: "" };
  }

  override async sendCommand(name: string, cmd: string | object): Promise<CommandResult> {
    this.lastSentCommand = { name, cmd };
    return { success: true, stdout: "", stderr: "" };
  }

  override isRunning(name: string): boolean {
    return false;
  }
}

Deno.test("createVpnManager - Windows platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11", isRoot: false };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("test-wg");
  assertEquals(sidecar.lastSentCommand?.name, "tunnel");
  assertEquals(sidecar.lastSentCommand?.cmd.type, "CONNECT");
});

Deno.test("createVpnManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04", isRoot: false };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("test-wg");
  assertEquals(sidecar.lastSentCommand?.name, "tunnel");
  assertEquals(sidecar.lastSentCommand?.cmd.type, "CONNECT");
});

Deno.test("createVpnManager - Full lifecycle (Windows)", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "windows", version: "11", tag: "windows_11", isRoot: false };

  const manager = createVpnManager(sidecar, executor, platform);

  await manager.connect("wg0");
  assertEquals(sidecar.lastSentCommand?.cmd.type, "CONNECT");

  await manager.isConnected();
  assertEquals(sidecar.lastSentCommand?.cmd.type, "GET_STATUS");

  await manager.getStatus();
  assertEquals(sidecar.lastSentCommand?.cmd.type, "GET_STATUS");

  await manager.disconnect();
  assertEquals(sidecar.lastSentCommand?.cmd.type, "DISCONNECT");
});

Deno.test("createFirewallManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04", isRoot: false };

  const manager = createFirewallManager(sidecar, executor, platform, null as any);

  await manager.blockIp("1.2.3.4");
  assertEquals(executor.lastCmd, "ufw");
  assertEquals(executor.lastArgs, ["deny", "from", "1.2.3.4"]);
});

Deno.test("createAntivirusManager", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04", isRoot: false };

  const manager = createAntivirusManager(sidecar, executor, platform);

  await manager.scanPath("/tmp/test.txt");
  assertEquals(sidecar.lastSentCommand?.name, "analyzer");
  assertEquals(sidecar.lastSentCommand?.cmd.type, "ScanPath");
});

Deno.test("createPersistenceManager - Ubuntu platform", async () => {
  const executor = new MockExecutor();
  const sidecar = new MockSidecarManager(executor, null as any);
  const platform: PlatformInfo = { name: "ubuntu", version: "24.04", tag: "ubuntu_24.04", isRoot: false };

  const manager = createPersistenceManager(sidecar, executor, platform);

  await manager.audit();
  assertEquals(executor.calls.some(c => c.cmd === "ls" && c.args.includes("/etc/cron.d")), true);
});
