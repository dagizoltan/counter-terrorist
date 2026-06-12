import { assertEquals } from "@std/assert";
import { PolicyDSL, Rule } from "@domain/orchestration/policy_dsl.ts";
import { PolicyEngine } from "@domain/orchestration/policy_engine.ts";

Deno.test("PolicyDSL - Simple and Complex Matching", () => {
    const dsl = new PolicyDSL();
    const rules: Rule[] = [
        {
            id: "1",
            name: "High Severity Block",
            description: "Block critical threats immediately",
            priority: 100,
            conjunction: "AND",
            action: "BLOCK",
            conditions: [
                { field: "severity", operator: ">=", value: 90 },
                { field: "type", operator: "==", value: "MALWARE" }
            ]
        },
        {
            id: "2",
            name: "Suspicious IP Watch",
            description: "Watch known suspicious ranges",
            priority: 50,
            conjunction: "OR",
            action: "WATCH",
            conditions: [
                { field: "source", operator: "contains", value: "192.168." },
                { field: "description", operator: "matches", value: ".*unauthorized.*" }
            ]
        }
    ];

    // Test Match 1
    const match1 = dsl.evaluate(rules, { type: "MALWARE", severity: 95 });
    assertEquals(match1?.id, "1");
    assertEquals(match1?.action, "BLOCK");

    // Test Match 2 (OR)
    const match2 = dsl.evaluate(rules, { source: "192.168.1.1", severity: 10 });
    assertEquals(match2?.id, "2");
    assertEquals(match2?.action, "WATCH");

    // Test No Match
    const match3 = dsl.evaluate(rules, { type: "INFO", severity: 5 });
    assertEquals(match3, null);
});

Deno.test("PolicyEngine - DSL Integration", () => {
    const mockLogging = { log: () => Promise.resolve() } as any;
    const mockConfig = { getEnv: () => "false" } as any;
    const policy = new PolicyEngine(mockLogging, mockConfig, {
        rules: [
            {
                id: "dsl-rule",
                name: "DSL Rule",
                description: "D",
                priority: 200,
                conjunction: "AND",
                action: "ISOLATE",
                conditions: [{ field: "tag", operator: "==", value: "EVIL" }]
            }
        ]
    });

    // Should use DSL rule when context matches
    const decision1 = policy.evaluate(10, { tag: "EVIL" });
    assertEquals(decision1.action, "ISOLATE");

    // Should fallback to thresholds when context doesn't match
    const decision2 = policy.evaluate(10, { tag: "GOOD" });
    assertEquals(decision2.action, "WATCH");
});
