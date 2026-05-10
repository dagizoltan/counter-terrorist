import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EventBus, SystemEvent } from "@domain/analysis/events.ts";
import { LoggingPort, LogEntry, LogSeverity, LogType, SyslogSeverity } from "@core/ports.ts";

class MockLogging implements LoggingPort {
  public logs: LogEntry[] = [];

  enableGlobalIntercept(): void {}

  async log(entry: LogEntry): Promise<void> {
    this.logs.push(entry);
  }

  async getRecentLogs(limit?: number): Promise<LogEntry[]> {
    return this.logs.slice(-(limit || 10));
  }

  async logLegacy(message: string, severity?: LogSeverity | SyslogSeverity, source?: string, payload?: any): Promise<void> {
    this.logs.push({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: (severity as any) || LogSeverity.INFO,
        caller: source || "LEGACY",
        message,
        payload
    });
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

Deno.test("EventBus.on (keyed subscription)", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const receivedData: any[] = [];

  eventBus.on("INFO", (data) => {
    receivedData.push(data);
  });

  eventBus.publish("INFO", "Info msg", { foo: "bar" });
  eventBus.publish("WARN", "Warn msg", { skip: "me" });

  assertEquals(receivedData.length, 1);
  assertEquals(receivedData[0], { foo: "bar" });
});

Deno.test("EventBus.unsubscribe (general)", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count = 0;
  const handler = () => { count++; };

  const unsub = eventBus.subscribe(handler);
  eventBus.publish("INFO", "msg 1");
  assertEquals(count, 1);

  unsub();
  eventBus.publish("INFO", "msg 2");
  assertEquals(count, 1);

  // Manual unsubscribe
  const handler2 = () => { count++; };
  eventBus.subscribe(handler2);
  eventBus.publish("INFO", "msg 3");
  assertEquals(count, 2);

  eventBus.unsubscribe(handler2);
  eventBus.publish("INFO", "msg 4");
  assertEquals(count, 2);
});

Deno.test("EventBus.unsubscribe (keyed)", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count = 0;
  const handler = () => { count++; };

  const unsub = eventBus.on("INFO", handler);
  eventBus.publish("INFO", "msg 1");
  assertEquals(count, 1);

  unsub();
  eventBus.publish("INFO", "msg 2");
  assertEquals(count, 1);

  // Manual unsubscribe
  const handler2 = () => { count++; };
  eventBus.on("WARN", handler2);
  eventBus.publish("WARN", "msg 3");
  assertEquals(count, 2);

  eventBus.unsubscribe(handler2);
  eventBus.publish("WARN", "msg 4");
  assertEquals(count, 2);
});

Deno.test("EventBus.unsubscribe should remove from all registrations", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count = 0;
  const handler = () => { count++; };

  eventBus.on("INFO", handler);
  eventBus.on("WARN", handler);
  eventBus.subscribe(handler as any);

  eventBus.publish("INFO", "msg 1"); // +2 (on INFO and subscribe)
  eventBus.publish("WARN", "msg 2"); // +2 (on WARN and subscribe)
  assertEquals(count, 4);

  eventBus.unsubscribe(handler);
  eventBus.publish("INFO", "msg 3");
  eventBus.publish("WARN", "msg 4");
  assertEquals(count, 4);
});

Deno.test("EventBus.emit alias", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let received: any = null;

  eventBus.on("CUSTOM", (data) => {
    received = data;
  });

  eventBus.emit("CUSTOM", { hello: "world" });
  assertEquals(received, { hello: "world" });
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
  assertEquals(mockLogging.logs[0].severity, LogSeverity.ERROR);
  assertEquals(mockLogging.logs[1].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[2].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[3].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[4].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[5].severity, LogSeverity.INFO);
  assertEquals(mockLogging.logs[6].severity, LogSeverity.INFO);
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
  await new Promise(resolve => setTimeout(resolve, 50));

  const errorLog = mockLogging.logs.find(l => l.message.includes("Handler error:"));
  assertEquals(!!errorLog, true);
  assertEquals(errorLog?.severity, LogSeverity.ERROR);
  assertEquals(errorLog?.message.includes("Test handler error"), true);
});

Deno.test("EventBus edge cases", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const events: SystemEvent[] = [];

  eventBus.subscribe(e => { events.push(e); });

  // Undefined data
  eventBus.publish("INFO", "No data");
  assertEquals(events[0].data, undefined);

  // Empty message
  eventBus.publish("INFO", "");
  assertEquals(events[1].message, "");

  // Multiple subscribers of different types
  let keyedCount = 0;
  eventBus.on("INFO", () => { keyedCount++; });

  eventBus.publish("INFO", "Both");
  assertEquals(events.length, 3);
  assertEquals(keyedCount, 1);
});
