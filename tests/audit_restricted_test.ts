import { assertEquals } from "@std/assert";
import { AuditService } from "@domain/analysis/audit.ts";
import { AuditVerifier } from "@domain/analysis/audit_verifier.ts";

Deno.test("AuditService - Forensic restricted mode", async () => {
    const repo = {
        getLatest: async () => [],
        save: async () => {},
        saveMany: async () => {},
        count: async () => 0
    } as any;
    const logging = { log: () => Promise.resolve() } as any;

    const verifier = new AuditVerifier(repo, logging);
    const service = new AuditService(repo, logging, verifier);
    // @ts-ignore
    service.initialized = true;

    // @ts-ignore
    service.state = "FORENSIC_RESTRICTED"; // Enum matches "FORENSIC_RESTRICTED"

    let logged = false;
    // @ts-ignore
    service.logEvent({ type: "INFO", message: "Should be dropped" });

    // @ts-ignore
    assertEquals(service.logQueue.length, 0);

    // Critical events should still be logged
    // @ts-ignore
    service.isProcessingQueue = true; // Prevent automatic processing for test assertion
    // @ts-ignore
    service.logEvent({ type: "CRITICAL", message: "Should be kept" });
    // @ts-ignore
    assertEquals(service.logQueue.length, 1);
});
