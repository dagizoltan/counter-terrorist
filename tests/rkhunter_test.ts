import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RkhunterManager } from "@infrastructure/system/protection/rkhunter/rkhunter.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { initBroadcaster } from "@interface/ws_handler.ts";

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
    const mockLogger = { log: async () => {} } as any;
    super(new SystemExecutor(), mockLogger);
  }

  override async sendCommand(_name: string, _cmd: string | object): Promise<any> {
    if (this.shouldFail) {
        throw new Error("Mock failure");
    }
    // BUG-12: Mock response must include 'data' field to match normalization logic
    return {
        success: true,
        data: {
            stdout: "rkhunter scan passed",
            stderr: ""
        }
    };
  }
}

Deno.test({
  name: "RkhunterManager.runScan - success",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const sidecar = new MockSidecarManager();
    const manager = new RkhunterManager(sidecar as any);

    const result = await manager.runScan();

    assertEquals(result.success, true);
    if (result.success) {
        assertEquals(result.data.success, true);
        assertEquals(result.data.stdout, "rkhunter scan passed");
    }
    assertEquals(manager.getLastResult()?.success, true);
  }
});

Deno.test({
  name: "RkhunterManager.runScan - failure returns null",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const sidecar = new MockSidecarManager();
    sidecar.shouldFail = true;
    const manager = new RkhunterManager(sidecar as any);

    const result = await manager.runScan();

    // withTelemetry catches the throw in _runScan and returns a Result.err
    assertEquals(result.success, false);
  }
});
