import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { AutoBlockService } from "../src/orchestrator/domain/protection/auto_block_service.ts";
import { LoggingService } from "../src/orchestrator/infrastructure/system/logging.ts";

Deno.test("AutoBlockService - Triggers block on honeypot event", async () => {
    const logging = new LoggingService();
    const eventBus = new EventBus(logging);
    let blockedIp = "";

    const mockFirewall = {
        blockIp: (ip: string) => {
            blockedIp = ip;
            return Promise.resolve({ success: true, stdout: "", stderr: "" });
        }
    } as any;

    new AutoBlockService(eventBus, mockFirewall, logging);

    // Simulate honeypot event
    eventBus.publish("AUDIT_EVENT", "Honeypot Triggered", {
        caller: "decoy:ssh",
        payload: { source_ip: "1.2.3.4" }
    });

    // Small delay for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    assertEquals(blockedIp, "1.2.3.4");
});
