import { assertEquals, assertExists } from "@std/assert";
import { IncidentService } from "@domain/analysis/incident_service.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("IncidentService - Report and list incidents", async () => {
    const logger = new MockLoggingPort();
    const kv = await Deno.openKv(":memory:");
    const service = new IncidentService(kv, logger);

    await service.reportIncident({
        severity: "HIGH",
        title: "Test Breach",
        description: "An actor did something bad.",
        source: "10.0.0.5",
        indicators: ["malicious_hash_1"]
    });

    const count = await service.count();
    assertEquals(count, 1);

    const incidents = await service.getIncidents();
    assertEquals(incidents.length, 1);
    assertEquals(incidents[0].title, "Test Breach");
    assertEquals(incidents[0].status, "OPEN");

    // Update status
    const id = incidents[0].id;
    await service.updateStatus(id, "INVESTIGATING");

    const updated = await service.getIncidents();
    assertEquals(updated[0].status, "INVESTIGATING");

    kv.close();
});
