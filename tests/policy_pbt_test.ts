import { assertEquals } from "@std/assert";
import { PolicyEngine } from "@domain/orchestration/policy_engine.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";
import * as fc from "fast-check";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("PolicyEngine - PBT Threshold Evaluation", () => {
    const logger = new MockLoggingPort();
    const config = { getEnv: () => undefined } as any;

    fc.assert(
        fc.property(
            fc.integer({ min: 0, max: 1000 }),
            (score) => {
                const policy = new PolicyEngine(logger, config);
                const decision = policy.evaluate(score);

                // Assert basic invariants
                assertEquals(typeof decision.action, "string");
                assertEquals(typeof decision.description, "string");

                if (score >= 100) {
                    assertEquals(decision.action, "LOCKDOWN");
                } else if (score >= 90) {
                    assertEquals(decision.action, "ISOLATE");
                } else if (score >= 60) {
                    assertEquals(decision.action, "BLOCK");
                } else if (score >= 30) {
                    assertEquals(decision.action, "SHADOW");
                } else if (score >= 10) {
                    assertEquals(decision.action, "WATCH");
                } else {
                    assertEquals(decision.action, "LOG");
                }
            }
        )
    );
});
