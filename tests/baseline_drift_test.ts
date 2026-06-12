import { assertEquals } from "jsr:@std/assert";
import { BaselineService, SystemSnapshot } from "@domain/analysis/baseline.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LoggingPort } from "@core/ports.ts";

const mockLogging: LoggingPort = {
    log: () => Promise.resolve(),
    logLegacy: () => Promise.resolve(),
    getRecentLogs: () => Promise.resolve([]),
    shutdown: () => Promise.resolve(),
    setConfig: () => {},
    setKv: () => {}
};

class MockSidecar {
    async sendCommand(agent: string, cmd: any) {
        if (agent === "analyzer" && (cmd === "SCAN" || cmd.type === "SCAN")) {
            return { success: true, data: { processes: [] } };
        }
        if (agent === "analyzer" && cmd.type === "DIR_SCAN") {
            return { success: true, data: { files: [] } };
        }
        return { success: true, data: {} };
    }
}

class MockExecutor {
    async execute(cmd: string, args: string[]) {
        if (cmd === "ss") {
            return { success: true, stdout: "LISTEN 0 0 127.0.0.1:8000", stderr: "" };
        }
        return { success: true, stdout: "", stderr: "" };
    }
}

Deno.test("BaselineService - Drift Detection", async () => {
    const kv = await Deno.openKv(":memory:");
    const executor = new MockExecutor();
    const service = new BaselineService(kv, new MockSidecar() as any, executor as any, mockLogging);

    // Initial baseline
    await service.setBaseline();

    // Mock drift in ports by replacing executor logic
    executor.execute = async (cmd: string, _args: string[]) => {
        if (cmd === "ss") {
            return { success: true, stdout: "LISTEN 0 0 127.0.0.1:8000\nLISTEN 0 0 127.0.0.1:9000", stderr: "" };
        }
        return { success: true, stdout: "", stderr: "" };
    };

    const drift = await service.checkDrift();
    assertEquals(drift?.newPorts.length, 1);
    assertEquals(drift?.newPorts[0], "127.0.0.1:9000");

    kv.close();
});
