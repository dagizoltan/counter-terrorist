import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RkhunterManager } from "@infrastructure/system/protection/rkhunter/rkhunter.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { initBroadcaster } from "@api/ws.ts";

// Mock dependencies for WS broadcaster
const mockDeps = {
  notificationService: { notify: async () => {} } as any,
  auditService: { logEvent: async () => {} } as any,
  eventBus: { publish: () => {} } as any,
};
initBroadcaster(mockDeps);

class MockSidecarManager extends SidecarManager {
  shouldFail = false;

  constructor() {
    super(new SystemExecutor(), null as any);
  }

  override async sendCommand(_name: string, _cmd: string | object): Promise<any> {
    if (this.shouldFail) {
      throw new Error("Mock sidecar failure");
    }
    return { success: true, stdout: "rkhunter scan passed", stderr: "" };
  }
}

Deno.test("RkhunterManager.runScan - success", async () => {
  const sidecar = new MockSidecarManager();
  const manager = new RkhunterManager(sidecar as any);

  const result = await manager.runScan();

  assertEquals(result?.success, true);
  assertEquals(result?.stdout, "rkhunter scan passed");
  assertEquals(manager.getLastResult()?.success, true);
});

Deno.test("RkhunterManager.runScan - failure returns null", async () => {
  const sidecar = new MockSidecarManager();
  sidecar.shouldFail = true;
  const manager = new RkhunterManager(sidecar as any);

  const result = await manager.runScan();

  assertEquals(result, null);
  assertEquals(manager.getLastResult(), null);
});
