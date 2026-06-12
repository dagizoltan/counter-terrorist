import { assertEquals } from "@std/assert";
import { PolicyDSL, Rule } from "@domain/orchestration/policy_dsl.ts";

Deno.test("PolicyDSL - Edge Cases: Empty Rules", () => {
    const dsl = new PolicyDSL();
    assertEquals(dsl.evaluate([], {}), null);
});

Deno.test("PolicyDSL - Edge Cases: Missing Fields", () => {
    const dsl = new PolicyDSL();
    const rules: Rule[] = [{
        id: "1", name: "N", description: "D", priority: 1, conjunction: "AND", action: "LOG",
        conditions: [{ field: "missing", operator: "==", value: 1 }]
    }];
    assertEquals(dsl.evaluate(rules, { other: 1 }), null);
});

Deno.test("PolicyDSL - Operators: !=", () => {
    const dsl = new PolicyDSL();
    const rules: Rule[] = [{
        id: "1", name: "N", description: "D", priority: 1, conjunction: "AND", action: "BLOCK",
        conditions: [{ field: "val", operator: "!=", value: 10 }]
    }];
    assertEquals(dsl.evaluate(rules, { val: 5 })?.action, "BLOCK");
    assertEquals(dsl.evaluate(rules, { val: 10 }), null);
});

Deno.test("PolicyDSL - Operators: >= and <=", () => {
    const dsl = new PolicyDSL();
    const rules: Rule[] = [{
        id: "1", name: "N", description: "D", priority: 1, conjunction: "AND", action: "BLOCK",
        conditions: [{ field: "val", operator: ">=", value: 10 }]
    }];
    assertEquals(dsl.evaluate(rules, { val: 10 })?.action, "BLOCK");
    assertEquals(dsl.evaluate(rules, { val: 9 }), null);
});

Deno.test("PolicyDSL - Conjunction: OR Match", () => {
    const dsl = new PolicyDSL();
    const rules: Rule[] = [{
        id: "1", name: "N", description: "D", priority: 1, conjunction: "OR", action: "BLOCK",
        conditions: [
            { field: "a", operator: "==", value: 1 },
            { field: "b", operator: "==", value: 2 }
        ]
    }];
    assertEquals(dsl.evaluate(rules, { a: 1 })?.action, "BLOCK");
    assertEquals(dsl.evaluate(rules, { b: 2 })?.action, "BLOCK");
    assertEquals(dsl.evaluate(rules, { c: 3 }), null);
});
