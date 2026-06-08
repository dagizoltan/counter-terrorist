import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalStringify } from "../src/orchestrator/core/crypto_utils.ts";

Deno.test("JSON Bomb Protection - Recursion Depth", () => {
    const deep: any = {};
    let current = deep;
    for (let i = 0; i < 15; i++) {
        current.nested = {};
        current = current.nested;
    }

    assertThrows(() => {
        canonicalStringify(deep);
    }, Error, "Max recursion depth");
});

Deno.test("JSON Bomb Protection - Breadth Limit", () => {
    const wideObj: any = {};
    for (let i = 0; i < 101; i++) {
        wideObj[`key_${i}`] = i;
    }

    assertThrows(() => {
        canonicalStringify(wideObj);
    }, Error, "Max object breadth");

    const wideArr: any = [];
    for (let i = 0; i < 101; i++) {
        wideArr.push(i);
    }

    assertThrows(() => {
        canonicalStringify(wideArr);
    }, Error, "Max array breadth");
});

Deno.test("JSON Bomb Protection - Normal Payloads", () => {
    const normal = { a: 1, b: [1, 2, 3], c: { d: "hello" } };
    const expected = '{"a":1,"b":[1,2,3],"c":{"d":"hello"}}';
    assertEquals(canonicalStringify(normal), expected);
});
