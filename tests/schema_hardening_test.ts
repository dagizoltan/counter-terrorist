import { assertEquals } from "@std/assert";
import { validateRequest } from "@infrastructure/system/validation.ts";

Deno.test("Firewall Sidecar Schema Validation", () => {
    // Valid requests
    assertEquals(validateRequest("firewall", { type: "BlockIp", ip: "1.2.3.4" }), true);
    assertEquals(validateRequest("firewall", { type: "KillProcess", pid: 1234 }), true);
    assertEquals(validateRequest("firewall", { type: "AllowPort", port: 80, protocol: "tcp" }), true);
    assertEquals(validateRequest("firewall", { type: "GetStatus" }), true);

    // Invalid requests
    assertEquals(validateRequest("firewall", { type: "InvalidAction" }), false);
    assertEquals(validateRequest("firewall", { type: "BlockIp" }), false); // Missing IP
    assertEquals(validateRequest("firewall", { type: "AllowPort", port: "80" }), false); // Wrong type
});

Deno.test("Telemetry Win Sidecar Schema Validation", () => {
    assertEquals(validateRequest("telemetry-win", { type: "GetStatus" }), true);
    assertEquals(validateRequest("telemetry-win", { type: "Shutdown" }), true);
    assertEquals(validateRequest("telemetry-win", { type: "Invalid" }), false);
});

Deno.test("Mesh Sidecar Schema Validation", () => {
    assertEquals(validateRequest("mesh", { type: "GET_STATUS" }), true);
    assertEquals(validateRequest("mesh", { type: "GOSSIP_BLOCK", ip: "1.2.3.4" }), true);
    assertEquals(validateRequest("mesh", { type: "MERKLE_CATCH_UP", lastKnownHash: "abc", nodeId: "node1" }), true);

    // Test nested AuditEvent validation in mesh
    assertEquals(validateRequest("mesh", {
        type: "GOSSIP_AUDIT",
        events: [{ type: "TEST", message: "Hello" }]
    }), true);

    assertEquals(validateRequest("mesh", {
        type: "GOSSIP_AUDIT",
        events: [{ type: "TEST" }] // Missing message
    }), false);

    assertEquals(validateRequest("mesh", { type: "Invalid" }), false);
});
