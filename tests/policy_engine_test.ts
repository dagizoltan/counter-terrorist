import { assertEquals } from "@std/assert";
import { PolicyEngine } from "@domain/orchestration/policy_engine.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("PolicyEngine - Evaluation thresholds", () => {
    const logger = new MockLoggingPort();
    const config = { getEnv: () => undefined } as any;
    const policy = new PolicyEngine(logger, config, {
        thresholds: [
            { score: 10, action: "WATCH", description: "W" },
            { score: 50, action: "BLOCK", description: "B" },
            { score: 90, action: "LOCKDOWN", description: "L" }
        ]
    });

    assertEquals(policy.evaluate(5).action, "LOG");
    assertEquals(policy.evaluate(15).action, "WATCH");
    assertEquals(policy.evaluate(55).action, "BLOCK");
    assertEquals(policy.evaluate(95).action, "LOCKDOWN");
});

Deno.test("PolicyEngine - Shadow mode and updates", () => {
    const logger = new MockLoggingPort();
    const config = { getEnv: () => undefined } as any;
    const policy = new PolicyEngine(logger, config);

    policy.setShadowMode(true);
    assertEquals(policy.isShadowMode(), true);

    policy.updatePolicy({ version: "2.0.0", defaultAction: "WATCH" });
    assertEquals(policy.getPolicy().version, "2.0.0");
    assertEquals(policy.evaluate(0).action, "WATCH");
});
