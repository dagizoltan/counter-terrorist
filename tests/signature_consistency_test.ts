import { assertEquals } from "@std/assert";
import { canonicalStringify } from "../src/orchestrator/core/crypto_utils.ts";

Deno.test("Signature Consistency - Canonical Stringify remains stable across different object property orders", () => {
  const obj1 = { a: 1, b: 2, c: { d: 3, e: 4 } };
  const obj2 = { c: { e: 4, d: 3 }, b: 2, a: 1 };

  const str1 = canonicalStringify(obj1);
  const str2 = canonicalStringify(obj2);

  assertEquals(str1, str2, "Canonical stringify should produce identical output regardless of property order");
});

Deno.test("Signature Consistency - Canonical Stringify handles nested arrays and nulls", () => {
  const obj1 = { a: [1, 2, 3], b: null, c: { d: "test" } };
  const obj2 = { c: { d: "test" }, a: [1, 2, 3], b: null };

  assertEquals(canonicalStringify(obj1), canonicalStringify(obj2));
});
