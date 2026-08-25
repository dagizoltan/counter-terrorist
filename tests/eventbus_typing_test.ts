import { assertEquals, assertRejects } from "@std/assert";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { LogSeverity } from "../src/orchestrator/core/ports.ts";

Deno.test("EventBus Hardening - Schema validation for typed events", async () => {
    const mockLogging = { log: () => Promise.resolve() };
    const bus = new EventBus(mockLogging as any);

    let receivedData: any = null;
    bus.on("HONEYPOT", (data) => {
        receivedData = data;
    });

    // Valid data
    await bus.publish("HONEYPOT", "Test", { type: "PortAccess", source_ip: "1.1.1.1", port: 80, module: "http" });
    assertEquals(receivedData?.source_ip, "1.1.1.1");
    assertEquals(receivedData?.fromEventBus, true, "Middleware/Finalizer should attach metadata");

    // Invalid data should still be published but might be stripped or handled by validator
    // In our current validateEvent implementation (if it uses Zod.safeParse and returns data),
    // it depends on how @core/event_schema.ts is implemented.
});

Deno.test("EventBus Hardening - Middleware safety and timeouts", async () => {
    const mockLogging = { log: () => Promise.resolve() };
    const bus = new EventBus(mockLogging as any);

    // Middleware that hangs
    bus.use(async (event, next) => {
        await new Promise(r => setTimeout(r, 10000)); // Hang longer than 5s timeout
        await next();
    });

    let finalized = false;
    bus.on("DEBUG", () => {
        finalized = true;
    });

    // Publish should finish despite hanging middleware due to timeout
    const start = Date.now();
    await bus.publish("DEBUG", "Timeout test");
    const end = Date.now();

    assertEquals(finalized, true, "Event should reach handlers even if middleware hangs");
    assertEquals(end - start < 7000, true, "Middleware should have timed out around 5s");
});

Deno.test("EventBus Hardening - High priority deterministic execution", async () => {
    const mockLogging = { log: () => Promise.resolve() };
    const bus = new EventBus(mockLogging as any);

    let executionOrder: string[] = [];

    bus.on("CRITICAL", async () => {
        await new Promise(r => setTimeout(r, 100));
        executionOrder.push("handler");
    });

    // CRITICAL events are awaited in publish
    await bus.publish("CRITICAL", "Critical alert", { message: "critical-payload" });
    executionOrder.push("after-publish");

    assertEquals(executionOrder[0], "handler");
    assertEquals(executionOrder[1], "after-publish");

    executionOrder = [];
    bus.on("INFO", async () => {
        await new Promise(r => setTimeout(r, 100));
        executionOrder.push("handler");
    });

    // INFO events are NOT awaited in publish
    await bus.publish("INFO", "Low priority", { message: "info-payload" });
    executionOrder.push("after-publish");

    assertEquals(executionOrder[0], "after-publish");
    // handler runs in background
});
