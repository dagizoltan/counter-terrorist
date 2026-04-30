import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("EventBus edge cases", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  const events: SystemEvent[] = [];

  eventBus.subscribe(e => events.push(e));

  // Undefined data
  eventBus.publish("INFO", "No data");
  assertEquals(events[0].data, undefined);

  // Empty message
  eventBus.publish("INFO", "");
  assertEquals(events[1].message, "");

  // Multiple subscribers of different types
  let keyedCount = 0;
  eventBus.on("INFO", () => keyedCount++);

  eventBus.publish("INFO", "Both");
  assertEquals(events.length, 3);
  assertEquals(keyedCount, 1);
});

Deno.test("EventBus.unsubscribe (partial keyed)", () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);
  let count1 = 0;
  let count2 = 0;
  const h1 = () => count1++;
  const h2 = () => count2++;

  eventBus.on("INFO", h1);
  eventBus.on("INFO", h2);

  eventBus.publish("INFO", "msg 1");
  assertEquals(count1, 1);
  assertEquals(count2, 1);

  eventBus.unsubscribe(h1);
  eventBus.publish("INFO", "msg 2");
  assertEquals(count1, 1);
  assertEquals(count2, 2);
});

Deno.test("EventBus handler error with non-Error object", async () => {
  const mockLogging = new MockLogging();
  const eventBus = new EventBus(mockLogging);

  eventBus.subscribe(() => {
    throw "string error";
  });

  eventBus.publish("INFO", "Test non-Error throw");

  // Test Error without stack
  eventBus.subscribe(() => {
    const err = new Error("error without stack");
    Object.defineProperty(err, 'stack', { get: () => undefined });
    throw err;
  });

  eventBus.publish("INFO", "Test Error without stack");

  // Wait for promise-based logging
  await new Promise(resolve => setTimeout(resolve, 10));

  const stringErrorLog = mockLogging.logs.find(l => l.message.includes("string error"));
  assertEquals(!!stringErrorLog, true);

  const noStackErrorLog = mockLogging.logs.find(l => l.message.includes("error without stack"));
  assertEquals(!!noStackErrorLog, true);
});

Deno.test("EventBus handle logging failure", async () => {
  const failingLogging: LoggingPort = {
    enableGlobalIntercept() {},
    log: () => Promise.reject(new Error("Logging failed")),
  };
  const eventBus = new EventBus(failingLogging);

  // This should not throw even if logging fails
  eventBus.publish("INFO", "Test logging failure");

  // Also test failure in safelyExecute logging
  eventBus.subscribe(() => {
    throw new Error("Handler failed");
  });

  eventBus.publish("INFO", "Test handler + logging failure");

  await new Promise(resolve => setTimeout(resolve, 10));
  // If we reached here without uncaught exception, it's successful
});
