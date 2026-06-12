import { assertEquals } from "jsr:@std/assert";
import { WatchdogService } from "@domain/analysis/watchdog_service.ts";
import { HealthService } from "@domain/analysis/health_service.ts";
import { LoggingPort } from "@core/ports.ts";
import { delay } from "jsr:@std/async";

class MockHealthService extends HealthService {
    statuses: { name: string; status: string }[] = [];
    constructor() { super({ log: () => Promise.resolve() } as any); }
    override getAllStatuses() { return this.statuses; }
}

const mockLogging: LoggingPort = {
    log: () => Promise.resolve(),
    logLegacy: () => Promise.resolve(),
    getRecentLogs: () => Promise.resolve([]),
    shutdown: () => Promise.resolve(),
    setConfig: () => {},
    setKv: () => {}
};

Deno.test("WatchdogService - Phoenix Resurrection", async () => {
    const health = new MockHealthService();
    let resurrected = "";

    const watchdog = new WatchdogService(health, mockLogging, async (name) => {
        resurrected = name;
        return true;
    });

    health.statuses = [{ name: "FailedService", status: "FAILED" }];

    // @ts-ignore
    await watchdog.checkHealth();

    assertEquals(resurrected, "FailedService");
});

Deno.test("WatchdogService - Max Restart Attempts", async () => {
    const health = new MockHealthService();
    let callCount = 0;

    const watchdog = new WatchdogService(health, mockLogging, async (_name) => {
        callCount++;
        return false; // Fail to resurrect
    });

    health.statuses = [{ name: "StubbornService", status: "FAILED" }];

    // @ts-ignore
    await watchdog.checkHealth(); // 1
    // @ts-ignore
    await watchdog.checkHealth(); // 2
    // @ts-ignore
    await watchdog.checkHealth(); // 3
    // @ts-ignore
    await watchdog.checkHealth(); // Should not call again

    assertEquals(callCount, 3);
});
