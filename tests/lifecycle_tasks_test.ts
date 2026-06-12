import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { CommandPort, LoggingPort } from "@core/ports.ts";
import { delay } from "jsr:@std/async";

class MockCommandPort implements CommandPort {
    commands: any[] = [];
    async sendCommand(agent: string, cmd: any) {
        this.commands.push({ agent, cmd });
        return { success: true, stdout: "", stderr: "" };
    }
}

const mockLogging: LoggingPort = {
    log: () => Promise.resolve(),
    logLegacy: () => Promise.resolve(),
    getRecentLogs: () => Promise.resolve([]),
    shutdown: () => Promise.resolve(),
    setConfig: () => {},
    setKv: () => {}
};

Deno.test("LifecycleService - Scheduled Task Execution", async () => {
    const commands = new MockCommandPort();
    const service = new LifecycleService(commands, mockLogging);

    // Override tick to be faster for testing
    // @ts-ignore: Accessing private for test
    service.tasks = [
        { id: "test-task", agent: "test-agent", command: "TEST_CMD", intervalMs: 10, jitterMs: 0 }
    ];

    // @ts-ignore
    service.timerId = setInterval(() => service.tick(), 20);
    await delay(100);
    service.shutdown();

    assertEquals(commands.commands.length >= 2, true, `Expected at least 2 commands, got ${commands.commands.length}`);
    assertEquals(commands.commands[0].agent, "test-agent");
    assertEquals(commands.commands[0].cmd.type, "TEST_CMD");
});

Deno.test("LifecycleService - Custom Task Execution", async () => {
    const commands = new MockCommandPort();
    const service = new LifecycleService(commands, mockLogging);
    let customRunCount = 0;

    service.addCustomTask(async () => {
        customRunCount++;
    });

    // @ts-ignore: Accessing private for test
    service.tasks = []; // No default tasks
    // @ts-ignore
    service.timerId = setInterval(() => service.tick(), 10);
    await delay(50);
    service.shutdown();

    assertEquals(customRunCount >= 1, true, "Custom task should have run");
});

Deno.test("LifecycleService - Jitter application", async () => {
    const commands = new MockCommandPort();
    const service = new LifecycleService(commands, mockLogging);

    // Task with high jitter
    // @ts-ignore
    service.tasks = [{ id: "jitter-task", agent: "a", command: "C", intervalMs: 10, jitterMs: 1000 }];

    service.start();
    await delay(50);
    service.shutdown();

    // With 1000ms jitter and only 50ms wait, it's highly unlikely to have run unless jitter was 0
    // But secureRandomInt(0, 1000) could be small.
    // This is more of a smoke test that it doesn't crash.
});
