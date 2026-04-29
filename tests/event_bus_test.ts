import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EventBus, SystemEvent } from "../orchestrator/services/events.ts";
import { LoggingPort, SyslogSeverity } from "../orchestrator/core/ports.ts";

class MockLogging implements LoggingPort {
  public logs: { message: string; severity?: SyslogSeverity }[] = [];

  enableGlobalIntercept(): void {}

  async log(message: string, severity?: SyslogSeverity): Promise<void> {
    this.logs.push({ message, severity });
  }
}

Deno.test("EventBus.subscribe and publish", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const events: SystemEvent[] = [];

  eventBus.subscribe((event) => {
    events.push(event);
  });

  const testData = { key: "value" };
  eventBus.publish("INFO", "Test message", testData);

  assertEquals(events.length, 1);
  assertEquals(events[0].type, "INFO");
  assertEquals(events[0].message, "Test message");
  assertEquals(events[0].data, testData);
  assertEquals(typeof events[0].timestamp, "string");
});

Deno.test("EventBus severity mapping", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);

  eventBus.publish("CRITICAL", "Critical error");
  eventBus.publish("BLOCK", "Blocked action");
  eventBus.publish("WARN", "Warning message");
  eventBus.publish("DRIFT_PORT", "Port drift");
  eventBus.publish("DRIFT_PROCESS", "Process drift");
  eventBus.publish("INFO", "Info message");
  eventBus.publish("UNKNOWN", "Unknown type");

  assertEquals(mockLogging.logs.length, 7);
  assertEquals(mockLogging.logs[0].severity, SyslogSeverity.CRITICAL);
  assertEquals(mockLogging.logs[1].severity, SyslogSeverity.ALERT);
  assertEquals(mockLogging.logs[2].severity, SyslogSeverity.WARNING);
  assertEquals(mockLogging.logs[3].severity, SyslogSeverity.WARNING);
  assertEquals(mockLogging.logs[4].severity, SyslogSeverity.WARNING);
  assertEquals(mockLogging.logs[5].severity, SyslogSeverity.INFORMATIONAL);
  assertEquals(mockLogging.logs[6].severity, SyslogSeverity.INFORMATIONAL);
});

Deno.test("EventBus handler error isolation", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let handlerCalled = false;

  eventBus.subscribe(() => {
    throw new Error("Failing handler");
  });

  eventBus.subscribe(() => {
    handlerCalled = true;
  });

  // This should not throw and should call the second handler
  eventBus.publish("INFO", "Test error isolation");

  assertEquals(handlerCalled, true);
});

Deno.test("EventBus logs handler errors", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const error = new Error("Test handler error");

  eventBus.subscribe(() => {
    throw error;
  });

  eventBus.publish("INFO", "Test error logging");

  // Wait for promise-based logging to complete
  await new Promise(resolve => setTimeout(resolve, 10));

  const errorLog = mockLogging.logs.find(l => l.message.includes("[EVENTBUS] Handler error"));
  assertEquals(!!errorLog, true);
  assertEquals(errorLog?.severity, SyslogSeverity.ERROR);
  assertEquals(errorLog?.message.includes("Test handler error"), true);
});
