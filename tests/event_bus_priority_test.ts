import { assertEquals } from "@std/assert";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { EventPriority } from "../src/orchestrator/core/ports/events.ts";

class MockLogging {
    async log() {}
}

Deno.test("EventBus - Priority Execution Order", async () => {
    const bus = new EventBus(new MockLogging() as any);
    const executionOrder: string[] = [];

    bus.on("TEST_EVENT", async () => {
        await new Promise(r => setTimeout(r, 50));
        executionOrder.push("LOW");
    }, EventPriority.LOW);

    bus.on("TEST_EVENT", async () => {
        await new Promise(r => setTimeout(r, 10));
        executionOrder.push("CRITICAL");
    }, EventPriority.CRITICAL);

    bus.on("TEST_EVENT", async () => {
        executionOrder.push("HIGH");
    }, EventPriority.HIGH);

    await bus.publish("TEST_EVENT", "Test");

    // All critical handlers must finish before high, and high before low.
    assertEquals(executionOrder[0], "CRITICAL");
    assertEquals(executionOrder[1], "HIGH");
    assertEquals(executionOrder[2], "LOW");
});

Deno.test("EventBus - Parallel Execution within Priority", async () => {
    const bus = new EventBus(new MockLogging() as any);
    let activeCount = 0;
    let maxConcurrent = 0;

    const handler = async () => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await new Promise(r => setTimeout(r, 50));
        activeCount--;
    };

    bus.on("PARALLEL", handler, EventPriority.HIGH);
    bus.on("PARALLEL", handler, EventPriority.HIGH);
    bus.on("PARALLEL", handler, EventPriority.HIGH);

    await bus.publish("PARALLEL", "Test");

    assertEquals(maxConcurrent, 3, "Handlers of the same priority should run in parallel");
});
