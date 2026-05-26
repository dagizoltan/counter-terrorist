import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { LoggingPort, LogType, LogSeverity } from "../src/orchestrator/core/ports.ts";
import { delay } from "https://deno.land/std@0.208.0/async/delay.ts";

const mockLogging: LoggingPort = {
    log: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
    setConfig: () => {},
    setKv: () => {},
    enableGlobalIntercept: () => {}
};

Deno.test("Chaos Resilience: EventBus under high load during handler failures", async () => {
    const eventBus = new EventBus(mockLogging);
    let handledCount = 0;
    let failedCount = 0;

    // Register a mix of slow, failing, and fast handlers
    eventBus.subscribe(async () => {
        await delay(50);
        handledCount++;
    });

    eventBus.subscribe(async () => {
        failedCount++;
        throw new Error("Simulated handler failure");
    });

    eventBus.subscribe(async () => {
        await delay(2000); // This should timeout (EventBus uses 2s timeout)
        handledCount++;
    });

    // Bombard the EventBus
    const eventCount = 100;
    const promises = [];
    for (let i = 0; i < eventCount; i++) {
        eventBus.publish("INFO" as any, `Chaos event ${i}`, { correlationId: `chaos-${i}` });
    }

    // Wait for all background handlers to settle or timeout
    await eventBus.shutdown();

    console.log(`Resilience Test Results: Handled: ${handledCount}, Failed: ${failedCount}`);

    // We expect some events to be handled.
    // 100 events * 2 working handlers = 200 expected handling calls (but one times out).
    // The failing handler is called 100 times.
    assertEquals(failedCount, 100);
    // The fast handler should have finished all 100.
    // The 2s delay handler might be caught by shutdown if it didn't timeout yet,
    // but shutdown also waits for pending handlers.
    // However, eventBus.shutdown() wait for pendingHandlers.
});
