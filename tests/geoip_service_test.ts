import { assertEquals, assertExists } from "@std/assert";
import { GeoIpService, TacticalIntel } from "@domain/analysis/geoip_service.ts";
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

Deno.test("GeoIpService - Deterministic lookup and caching", async () => {
    const logger = new MockLoggingPort();
    const service = new GeoIpService(logger);

    const ip = "1.2.3.4";
    const res1 = await service.lookup(ip);

    assertExists(res1.country);
    assertExists(res1.isp);

    // Test consistency
    const res2 = await service.lookup(ip);
    assertEquals(res1.country, res2.country);
    assertEquals(res1.asn, res2.asn);

    // Test different IP
    const res3 = await service.lookup("8.8.8.8");
    assertEquals(res3.ip, "8.8.8.8");

    const cache = service.getCache();
    assertEquals(Object.keys(cache).length, 2);
});
