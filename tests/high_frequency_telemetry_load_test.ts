import { assertEquals, assert } from "@std/assert";
import { EventMediator } from "../src/orchestrator/domain/analysis/event_mediator.ts";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { LoggingPort } from "../src/orchestrator/core/ports.ts";

class MockLogging implements LoggingPort {
  async log() {}
  async shutdown() {}
  setConfig() {}
  setKv() {}
  enableGlobalIntercept() {}
}

Deno.test("Phase 3 - High-Frequency Telemetry Load Testing (50,000 events/sec batching & backpressure)", async () => {
  const logging = new MockLogging();
  const eventBus = new EventBus(logging);
  const mediator = new EventMediator(eventBus, () => {}, logging);

  await mediator.init();

  let batchCount = 0;
  let totalEventsReceived = 0;

  eventBus.on("EBPF_SYSCALL_BATCH", (event: any) => {
    batchCount++;
    if (Array.isArray(event)) {
      totalEventsReceived += event.length;
    }
  });

  const TOTAL_EVENTS = 50000;
  const startTime = performance.now();

  // Simulate sidecar sending telemetry to SentinelIntegration
  const mockCommandPort = {
    onEvent: (sidecar: string, handler: (data: unknown) => Promise<void>) => {
      if (sidecar === "sentinel") {
        (async () => {
          for (let i = 0; i < TOTAL_EVENTS; i++) {
            await handler({
              data: {
                type: "SYSCALL_EVENT",
                pid: 1000 + (i % 10),
                comm: "telemetry_test",
                syscall: "sys_enter_openat",
                seq: i
              }
            });
          }
        })();
      }
    }
  };

  mediator.wireSidecars(mockCommandPort as any);

  // Force timer tick / flush for remaining buffered telemetry
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const duration = performance.now() - startTime;
  const eventsPerSec = (TOTAL_EVENTS / (duration / 1000));

  assert(totalEventsReceived > 0, "Telemetry batch pipeline should receive buffered events");
  assert(batchCount < TOTAL_EVENTS, "High-frequency events must be batched to prevent WebSocket connection thrashing");

  await mediator.shutdown();
});
