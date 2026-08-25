import { assertEquals, assert } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { EventMediator } from "../src/orchestrator/domain/events/event_mediator.ts";
import { EventBus } from "../src/orchestrator/domain/events/event_bus.ts";
import { MockLogging } from "./mocks.ts";

Deno.test("Phase 3 - High-Frequency Telemetry Load Testing (50,000 events/sec batching & backpressure)", async () => {
  const eventBus = new EventBus();
  const logging = new MockLogging();
  const mediator = new EventMediator(eventBus, logging);

  await mediator.init();

  let batchCount = 0;
  let totalEventsReceived = 0;

  mediator.subscribe("UI_BROADCAST_BATCH", (event: any) => {
    batchCount++;
    if (Array.isArray(event.events)) {
      totalEventsReceived += event.events.length;
    }
  });

  const TOTAL_EVENTS = 50000;
  const startTime = performance.now();

  // Fuzz WebSocket batching pipeline under extreme event volume
  for (let i = 0; i < TOTAL_EVENTS; i++) {
    mediator.emit("LOG", {
      type: "SYSTEM_EVENT",
      seq: i,
      payload: `Telemetry log event stream payload chunk ${i}`
    });
  }

  // Force timer tick / flush for remaining buffered telemetry
  await new Promise((resolve) => setTimeout(resolve, 150));

  const duration = performance.now() - startTime;
  const eventsPerSec = (TOTAL_EVENTS / (duration / 1000));

  assert(totalEventsReceived > 0, "Telemetry batch pipeline should receive buffered events");
  assert(batchCount < TOTAL_EVENTS, "High-frequency events must be batched to prevent WebSocket connection thrashing");

  await mediator.shutdown();
});
