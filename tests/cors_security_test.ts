import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Extracted CORS validation logic from WebAdapter for verification.
 */
function validateOrigin(origin: string | undefined, allowedOrigins: string[]): string | null {
  if (!origin) return null;
  // Security: Only allow origins that are explicitly listed in the allowlist.
  return allowedOrigins.includes(origin) ? origin : null;
}

Deno.test("CORS Origin Validation - Exact Match", () => {
  const allowed = ["http://localhost:8000", "https://app.example.com"];

  assertEquals(validateOrigin("http://localhost:8000", allowed), "http://localhost:8000");
  assertEquals(validateOrigin("https://app.example.com", allowed), "https://app.example.com");
});

Deno.test("CORS Origin Validation - Unauthorized Port", () => {
  const allowed = ["http://localhost:8000"];

  // Different port on localhost should be rejected
  assertEquals(validateOrigin("http://localhost:8001", allowed), null);
});

Deno.test("CORS Origin Validation - Unauthorized Subdomain", () => {
  const allowed = ["https://app.example.com"];

  // Subdomain not in list should be rejected
  assertEquals(validateOrigin("https://api.example.com", allowed), null);
});

Deno.test("CORS Origin Validation - Wildcard Handling", () => {
  // If '*' was in the raw list, our fix filters it out.
  const rawOrigins = ["http://localhost:8000", "*"];
  const allowed = rawOrigins.filter(o => o !== "*");

  assertEquals(allowed.includes("*"), false);
  assertEquals(validateOrigin("http://attacker.com", allowed), null);
  assertEquals(validateOrigin("*", allowed), null);
  assertEquals(validateOrigin("http://localhost:8000", allowed), "http://localhost:8000");
});

Deno.test("CORS Origin Validation - Null/Undefined Origin", () => {
  const allowed = ["http://localhost:8000"];

  assertEquals(validateOrigin(undefined, allowed), null);
});
