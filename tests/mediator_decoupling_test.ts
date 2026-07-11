import { assertEquals } from "@std/assert";
import { EventMediator } from "../src/orchestrator/domain/analysis/event_mediator.ts";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { BehavioralAnalyzer } from "../src/orchestrator/domain/analysis/behavioral_analyzer.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> {}
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return []; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("EventMediator - Dependency Injection Verification", async () => {
    const bus = new EventBus(new MockLoggingPort());
    const behavioral = new BehavioralAnalyzer();
    const mediator = new EventMediator(bus, () => {}, new MockLoggingPort(), undefined, behavioral);

    // Verify behavioral is injected and used
    // @ts-ignore: Accessing private for verification
    assertEquals(mediator.behavioral, behavioral);

    await mediator.shutdown();
    await bus.shutdown();
});
