import { assertEquals } from "@std/assert";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { NewsSignalService, NewsItem } from "@domain/analysis/news_signal_service.ts";
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

Deno.test("NewsSignalService - Risk analysis", () => {
    const logger = new MockLoggingPort();
    const service = new NewsSignalService(logger);

    // Test Critical
    const risk1 = (service as any).analyzeRisk("A zero-day exploit for Windows allowing unauthenticated RCE in the wild.");
    assertEquals(risk1.severity, "CRITICAL");
    assertEquals(risk1.score >= 50, true);

    // Test High
    const risk2 = (service as any).analyzeRisk("State-sponsored group leaked a data breach affecting millions of records.");
    // In actual implementation: 'state-sponsored' is HIGH (20), 'data breach' is HIGH (20), 'millions of records' is HIGH (20)
    // Total = 60. Score >= 50 returns CRITICAL.
    assertEquals(risk2.severity, "CRITICAL");

    // Test Low
    const risk3 = (service as any).analyzeRisk("A guide on best practices for interview prep.");
    assertEquals(risk3.severity, "LOW");
});

Deno.test("NewsSignalService - XML Feed parsing", async () => {
    const logger = new MockLoggingPort();
    const service = new NewsSignalService(logger);
    const kv = await Deno.openKv(":memory:");

    const mockRss = `
    <rss>
        <channel>
            <item>
                <title>Critical Zero-day Found</title>
                <link>https://example.com/1</link>
                <description>A new unauthenticated rce was found.</description>
            </item>
            <item>
                <title>Standard Report</title>
                <link>https://example.com/2</link>
                <description>Weekly security update.</description>
            </item>
        </channel>
    </rss>
    `;

    // Stub fetch to return mock RSS
    const fetchStub = stub(globalThis, "fetch", () => {
        return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(mockRss)
        } as any);
    });

    try {
        await service.start(kv);

        // Wait for async fetch
        await new Promise(r => setTimeout(r, 200));

        const signals = await service.getLatestSignals();
        assertEquals(signals.length > 0, true);

        const critical = signals.find(s => s.title.includes("Zero-day"));
        assertEquals(critical?.severity, "CRITICAL");

    } finally {
        fetchStub.restore();
        await service.shutdown();
        kv.close();
    }
});
