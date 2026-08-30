import * as fc from "fast-check";
import { assertEquals } from "@std/assert";
import { validateRequest, SidecarName } from "../src/orchestrator/infrastructure/system/validation.ts";

Deno.test("IPC Property-Based Fuzzing: Request Validation", () => {
  const sidecars: SidecarName[] = ["analyzer", "enforcer", "netcap", "sentinel", "watchfile"];

  for (const sidecar of sidecars) {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        // We don't expect it to crash or return true for random garbage
        try {
          const result = validateRequest(sidecar, payload as any);
          if (typeof payload !== "object" || payload === null || !("type" in payload)) {
            assertEquals(result, false);
          }
        } catch (e) {
          // It should never throw
          throw new Error(`Validation crashed for ${sidecar} with payload ${JSON.stringify(payload)}: ${e}`);
        }
      }),
      { numRuns: 1000 }
    );
  }
});

Deno.test("IPC Property-Based Fuzzing: Path Traversal Resistance", () => {
  fc.assert(
    fc.property(fc.string(), (path) => {
      const isInside = (p: string) => {
        if (p.includes("..")) return false;
        if (p.startsWith("/") && !p.startsWith("/home/") && !p.startsWith("/var/www/") && !p.startsWith("/var/lib/cts/")) return false;
        return true;
      };

      const result = validateRequest("analyzer", { type: "ScanPath", path });
      if (result === true) {
        assertEquals(isInside(path), true, `Path '${path}' was accepted but might be outside jail`);
      }
    }),
    { numRuns: 1000 }
  );
});
