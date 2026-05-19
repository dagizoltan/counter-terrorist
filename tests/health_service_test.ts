import { assertEquals } from "@std/assert";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { HealthService } from "@domain/analysis/health_service.ts";
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

Deno.test("HealthService - Status reporting and global severity", () => {
    const logger = new MockLoggingPort();
    const service = new HealthService(logger);

    service.reportStatus("sub1", "OPERATIONAL");
    assertEquals(service.getGlobalSeverity(), "SUCCESS");

    service.reportStatus("sub2", "BOOTING");
    assertEquals(service.getGlobalSeverity(), "WARNING");

    service.reportStatus("sub3", "FAILED", "Critical Error");
    assertEquals(service.getGlobalSeverity(), "DANGER");

    assertEquals(logger.logs.some(l => l.message.includes("Subsystem Failure: sub3")), true);

    service.shutdown();
});

Deno.test("HealthService - Resource auditing (Mocked ProcFS)", async () => {
    const logger = new MockLoggingPort();
    const service = new HealthService(logger);

    // Mock Deno.readTextFile for /proc paths
    const readTextFileStub = stub(Deno, "readTextFile", (path: string | URL) => {
        const p = path.toString();
        if (p.includes("/stat")) {
            // utime=100, stime=50 -> total=150
            return Promise.resolve("1 (test) S 0 0 0 0 0 0 0 0 0 0 100 50 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0");
        }
        if (p.includes("/status")) {
            return Promise.resolve("Name: test\nVmRSS: 100000 kB\n"); // ~100MB
        }
        return Promise.reject(new Error("Not found"));
    });

    try {
        // First audit to establish baseline ticks
        await service.auditAgentResources("sentinel", 123);

        // Wait a bit to ensure time delta > 0
        await new Promise(r => setTimeout(r, 100));

        // Update stub for second call to show increased CPU
        readTextFileStub.restore();
        const readTextFileStub2 = stub(Deno, "readTextFile", (path: string | URL) => {
            const p = path.toString();
            if (p.includes("/stat")) {
                // utime=200, stime=100 -> total=300 (delta=150)
                return Promise.resolve("1 (test) S 0 0 0 0 0 0 0 0 0 0 200 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0");
            }
            if (p.includes("/status")) {
                return Promise.resolve("Name: test\nVmRSS: 100000 kB\n");
            }
            return Promise.reject(new Error("Not found"));
        });

        try {
            await service.auditAgentResources("sentinel", 123);

            const statuses = service.getAllStatuses();
            const sentinelHealth = statuses.find(s => s.name === "sentinel");

            // quota for sentinel is 5% CPU, 64MB RAM. 100MB should trigger DEGRADED.
            assertEquals(sentinelHealth?.status, "DEGRADED");
            assertEquals(logger.logs.some(l => l.message.includes("exceeded resource quota")), true);
        } finally {
            readTextFileStub2.restore();
        }
    } finally {
        service.shutdown();
    }
});
