import { assertEquals } from "@std/assert";
import { EventBus, SystemEvent } from "@domain/analysis/events.ts";
import { LoggingPort, LogEntry, LogSeverity, LogType, SyslogSeverity } from "@core/ports.ts";

class MockLogging implements LoggingPort {
  public logs: LogEntry[] = [];

  enableGlobalIntercept(): void {}

  log(entry: LogEntry): Promise<void> {
    this.logs.push(entry);
    return Promise.resolve();
  }

  getRecentLogs(limit?: number): Promise<LogEntry[]> {
    return Promise.resolve(this.logs.slice(-(limit || 10)));
  }

  logLegacy(message: string, severity?: LogSeverity | SyslogSeverity, source?: string, payload?: unknown): Promise<void> {
    this.logs.push({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: (severity as LogSeverity) || LogSeverity.INFO,
        caller: source || "LEGACY",
        message,
        payload
    });
    return Promise.resolve();
  }

  setKv(_kv: Deno.Kv): void {}
  shutdown(): Promise<void> { return Promise.resolve(); }
}

Deno.test("EventBus.subscribe and publish", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const events: SystemEvent<any>[] = [];

  eventBus.subscribe((event) => {
    events.push(event);
  });

  const testData = { message: "Test message", data: { key: "value" } };
  await eventBus.publish("INFO", "Test message", testData);

  assertEquals(events.length, 1);
  assertEquals(events[0].type, "INFO");
  assertEquals(events[0].message, "Test message");
  assertEquals(events[0].data.message, "Test message");
  assertEquals(typeof events[0].timestamp, "string");
  assertEquals(typeof events[0].correlationId, "string");
});

Deno.test("EventBus.on (keyed subscription)", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const receivedData: any[] = [];

  eventBus.on("INFO", (data) => {
    receivedData.push(data);
  });

  await eventBus.publish("INFO", "Info msg", { message: "Info msg", data: { foo: "bar" } });
  await eventBus.publish("WARN", "Warn msg", { message: "Warn msg", data: { skip: "me" } });

  assertEquals(receivedData.length, 1);
  const data = receivedData[0] as any;
  assertEquals(data.data.foo, "bar");
  assertEquals(data.fromEventBus, true);
  assertEquals(typeof data.correlationId, "string");
});

Deno.test("EventBus.unsubscribe (general)", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count = 0;
  const handler = () => { count++; };

  const unsub = eventBus.subscribe(handler);
  await eventBus.publish("INFO", "msg 1", { message: "msg 1" });
  assertEquals(count, 1);

  unsub();
  await eventBus.publish("INFO", "msg 2", { message: "msg 2" });
  assertEquals(count, 1);

  // Manual unsubscribe
  const handler2 = () => { count++; };
  eventBus.subscribe(handler2);
  await eventBus.publish("INFO", "msg 3", { message: "msg 3" });
  assertEquals(count, 2);

  eventBus.unsubscribe(handler2);
  await eventBus.publish("INFO", "msg 4", { message: "msg 4" });
  assertEquals(count, 2);
});

Deno.test("EventBus.unsubscribe (keyed)", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count = 0;
  const handler = () => { count++; };

  const unsub = eventBus.on("INFO", handler);
  await eventBus.publish("INFO", "msg 1", { message: "msg 1" });
  assertEquals(count, 1);

  unsub();
  await eventBus.publish("INFO", "msg 2", { message: "msg 2" });
  assertEquals(count, 1);

  // Manual unsubscribe
  const handler2 = () => { count++; };
  eventBus.on("WARN", handler2);
  await eventBus.publish("WARN", "msg 3", { message: "msg 3" });
  assertEquals(count, 2);

  eventBus.unsubscribe(handler2);
  await eventBus.publish("WARN", "msg 4", { message: "msg 4" });
  assertEquals(count, 2);
});

Deno.test("EventBus.unsubscribe should remove from all registrations", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count = 0;
  const handler = (_event: unknown) => { count++; };

  eventBus.on("INFO", handler);
  eventBus.on("WARN", handler);
  eventBus.subscribe(handler);

  await eventBus.publish("INFO", "msg 1", { message: "msg 1" }); // +2 (on INFO and subscribe)
  await eventBus.publish("WARN", "msg 2", { message: "msg 2" }); // +2 (on WARN and subscribe)
  assertEquals(count, 4);

  eventBus.unsubscribe(handler);
  await eventBus.publish("INFO", "msg 3", { message: "msg 3" });
  await eventBus.publish("WARN", "msg 4", { message: "msg 4" });
  assertEquals(count, 4);
});

Deno.test("EventBus.emit alias", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let received: any = null;

  eventBus.on("ALERT", (data) => {
    received = data;
  });

  await eventBus.emit("ALERT", { message: "Alert!", data: { hello: "world" } });
  const data = received as any;
  assertEquals(data.data.hello, "world");
  assertEquals(data.fromEventBus, true);
  assertEquals(typeof data.correlationId, "string");
});

Deno.test("EventBus severity mapping", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);

  await eventBus.publish("CRITICAL", "Critical error", { message: "crit" });
  await eventBus.publish("BLOCK", "Blocked action", { message: "block" });
  await eventBus.publish("WARN", "Warning message", { message: "warn" });
  await eventBus.publish("DRIFT_PROCESS", "Process drift", { path: "/", action: "mod" });
  await eventBus.publish("INFO", "Info message", { message: "info" });

  assertEquals(mockLogging.logs.length, 5);
  assertEquals(mockLogging.logs[0].severity, LogSeverity.ERROR);
  assertEquals(mockLogging.logs[1].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[2].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[3].severity, LogSeverity.WARNING);
  assertEquals(mockLogging.logs[4].severity, LogSeverity.INFO);
});

Deno.test("EventBus handler error isolation", async () => {
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
  await eventBus.publish("INFO", "Test error isolation", { message: "iso" });

  assertEquals(handlerCalled, true);
});

Deno.test("EventBus logs handler errors", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const error = new Error("Test handler error");

  eventBus.subscribe(() => {
    throw error;
  });

  await eventBus.publish("INFO", "Test error logging", { message: "log" });

  // Wait for promise-based logging to complete
  await new Promise(resolve => setTimeout(resolve, 50));

  const errorLog = mockLogging.logs.find(l => l.message.includes("Handler error:"));
  assertEquals(!!errorLog, true);
  assertEquals(errorLog?.severity, LogSeverity.ERROR);
  assertEquals(errorLog?.message.includes("Test handler error"), true);
});

Deno.test("EventBus edge cases", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const events: SystemEvent<any>[] = [];

  eventBus.subscribe(e => { events.push(e); });

  // Undefined data should fail validation now
  try {
    await eventBus.publish("INFO", "No data", undefined as any);
  } catch (e) {
    assertEquals(e instanceof Error, true);
  }

  // Empty message
  await eventBus.publish("INFO", "", { message: "" });
  assertEquals(events[0].message, "");

  // Multiple subscribers of different types
  let keyedCount = 0;
  eventBus.on("INFO", () => { keyedCount++; });

  await eventBus.publish("INFO", "Both", { message: "Both" });
  assertEquals(events.length, 2); // 1 for first success, second threw error above
  assertEquals(keyedCount, 1);
});
