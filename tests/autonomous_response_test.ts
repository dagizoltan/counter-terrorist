import { assertEquals, assertExists } from "@std/assert";
import { AutonomousResponseEngine, ThreatEvent } from "@domain/orchestration/autonomous_response.ts";
import { PolicyEngine } from "@domain/orchestration/policy_engine.ts";
import { ThreatResponseSaga } from "@domain/orchestration/sagas/threat_response_saga.ts";
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

class MockThreatResponseSaga extends ThreatResponseSaga {
    calls: any[] = [];
    constructor() { super({} as any); }
    override async execute(source: string, tier: any, trigger: ThreatEvent, totalScore: number): Promise<any> {
        this.calls.push({ source, tier, trigger, totalScore });
        return { success: true };
    }
}

Deno.test("AutonomousResponseEngine - Scoring and Escalation", async () => {
    const logger = new MockLoggingPort();
    const saga = new MockThreatResponseSaga();
    const config = { getEnv: () => undefined } as any;
    const policy = new PolicyEngine(logger, config, {
        shadowMode: false,
        thresholds: [
            { score: 5, action: "WATCH", description: "WATCH" },
            { score: 10, action: "BLOCK", description: "BLOCK" },
            { score: 20, action: "ISOLATE", description: "ISOLATE" }
        ]
    });
    const engine = new AutonomousResponseEngine(saga, policy, logger);

    try {
        const source = "1.2.3.4";

        // 1. Initial hit (Low severity) -> LOG (total 2)
        await engine.evaluate({ source, type: "SCAN", severity: 2, description: "Port scan" });
        assertEquals(saga.calls[0].tier, "LOG");
        assertEquals(saga.calls[0].totalScore, 2);

        // 2. More hits -> WATCH (total 7 >= 5)
        await engine.evaluate({ source, type: "BRUTE_FORCE", severity: 5, description: "SSH Brute force" });
        assertEquals(saga.calls[1].tier, "WATCH");
        assertEquals(saga.calls[1].totalScore, 7);

        // 3. Escalation -> BLOCK (total 12 >= 10)
        await engine.evaluate({ source, type: "EXPLOIT", severity: 5, description: "RCE Attempt" });
        assertEquals(saga.calls[2].tier, "BLOCK");
        assertEquals(saga.calls[2].totalScore, 12);

        // 4. Critical -> ISOLATE (total 22 >= 20)
        await engine.evaluate({ source, type: "EXFIL", severity: 10, description: "Data exfiltration" });
        assertEquals(saga.calls[3].tier, "ISOLATE");
        assertEquals(saga.calls[3].totalScore, 22);
    } finally {
        engine.shutdown();
    }
});

Deno.test("AutonomousResponseEngine - Score Decay", async () => {
    const logger = new MockLoggingPort();
    const saga = new MockThreatResponseSaga();
    const config = { getEnv: () => undefined } as any;
    const policy = new PolicyEngine(logger, config);
    const engine = new AutonomousResponseEngine(saga, policy, logger);

    try {
        const source = "5.6.7.8";
        await engine.evaluate({ source, type: "TEST", severity: 5, description: "Test threat" });

        const intel1 = engine.getTacticalIntelligence();
        assertEquals(intel1[0].score, 5);

        // Manually trigger decay
        (engine as any).decayScores();

        const intel2 = engine.getTacticalIntelligence();
        assertEquals(intel2[0].score, 4);

        // Decay to zero
        for(let i=0; i<4; i++) (engine as any).decayScores();

        const intel3 = engine.getTacticalIntelligence();
        assertEquals(intel3.length, 0); // State should be cleared
    } finally {
        engine.shutdown();
    }
});

Deno.test("AutonomousResponseEngine - State Exhaustion Protection", async () => {
    const logger = new MockLoggingPort();
    const saga = new MockThreatResponseSaga();
    const config = { getEnv: () => undefined } as any;
    const policy = new PolicyEngine(logger, config);
    const engine = new AutonomousResponseEngine(saga, policy, logger);

    try {
        // MAX_SOURCES is 500
        for (let i = 0; i < 510; i++) {
            await engine.evaluate({ source: `ip-${i}`, type: "TEST", severity: 1, description: "Test" });
        }

        const intel = engine.getTacticalIntelligence();
        assertEquals(intel.length <= 500, true);
    } finally {
        engine.shutdown();
    }
});
