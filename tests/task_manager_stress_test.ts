import { assertEquals } from "@std/assert";
import { BackgroundTaskManager } from "../src/orchestrator/core/utils/background_task_manager.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";
import { delay } from "jsr:@std/async";

class MockLoggingPort implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> {}
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return []; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("BackgroundTaskManager - Stress & Shutdown", async () => {
    const logger = new MockLoggingPort();
    const manager = new BackgroundTaskManager(logger);
    let runCount = 0;

    // 1. Concurrent Tasks
    for (let i = 0; i < 50; i++) {
        manager.run(`task-${i}`, async () => {
            await delay(10);
            runCount++;
        });
    }

    assertEquals(manager.getActiveTaskCount(), 50);
    await delay(50);
    assertEquals(runCount, 50);
    assertEquals(manager.getActiveTaskCount(), 0);

    // 2. Scheduled Tasks & Shutdown
    let intervalCount = 0;
    manager.schedule("repeater", 10, async () => {
        intervalCount++;
    });

    await delay(55);
    const countBeforeShutdown = intervalCount;
    assertEquals(intervalCount >= 5, true, `Expected >= 5 runs, got ${intervalCount}`);

    manager.shutdown();
    await delay(30);
    assertEquals(intervalCount, countBeforeShutdown, "Tasks should not run after shutdown");
});
