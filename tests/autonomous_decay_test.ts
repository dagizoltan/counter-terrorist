import { assertEquals } from "@std/assert";
import { AutonomousResponseEngine } from "@domain/orchestration/autonomous_response.ts";

Deno.test("AutonomousResponseEngine - Score decay", async () => {
    const saga = { execute: async () => ({ success: true }) } as any;
    const policy = { evaluate: () => ({ action: "WATCH" }), isShadowMode: () => false } as any;
    const logging = { log: () => Promise.resolve() } as any;

    const engine = new AutonomousResponseEngine(saga, policy, logging);

    await engine.evaluate({ source: "1.1.1.1", type: "TEST", severity: 5, description: "D" });

    // @ts-ignore
    assertEquals(engine.scores.get("1.1.1.1"), 5);

    // Trigger decay
    // @ts-ignore
    engine.decayScores();

    // @ts-ignore
    assertEquals(engine.scores.get("1.1.1.1"), 4);
});
