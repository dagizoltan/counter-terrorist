import { assertEquals, assertRejects } from "@std/assert";
import { validateEvent } from "../src/orchestrator/core/event_schema.ts";

Deno.test("Event System Type Hardening - Validation", () => {
    // Valid audit broadcast
    const validAudit = {
        id: "id-1",
        timestamp: new Date().toISOString(),
        type: "INFO",
        message: "test",
        hash: "h1",
        prevHash: "h0",
        extra: "field" // passthrough
    };
    const res1 = validateEvent("AUDIT_BROADCAST", validAudit);
    assertEquals(res1.id, "id-1");

    // Invalid audit broadcast
    const invalidAudit = {
        id: "id-1",
        // missing fields
    };
    try {
        validateEvent("AUDIT_BROADCAST", invalidAudit);
        throw new Error("Should have thrown");
    } catch (e) {
        assertEquals(e.name, "ZodError");
    }

    // Valid audit verification
    const validVerif = {
        lastHash: "h1",
        eventCount: 10
    };
    const res2 = validateEvent("AUDIT_VERIFICATION", validVerif);
    assertEquals(res2.lastHash, "h1");
});
