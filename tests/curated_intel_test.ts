import { assertEquals, assertExists } from "@std/assert";
import { stub } from "@std/testing/mock";
import { CuratedIntelService } from "@domain/analysis/curated_intel_service.ts";
import { GeoIpService } from "@domain/analysis/geoip_service.ts";
import { LoggingPort, LogEntry, FirewallPort, ConfigurationPort, CommandResult } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

class MockFirewallPort implements FirewallPort {
    blockedIps: string[] = [];
    async blockIp(ip: string): Promise<CommandResult> { this.blockedIps.push(ip); return { success: true, stdout: "", stderr: "" }; }
    async unblockIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async isBlocked(_ip: string): Promise<boolean> { return false; }
    async shadowBanIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async lockdown(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async killProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async quarantineProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async enforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async unenforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getStatus(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async flushRules(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getBlockedIps(): Promise<string[]> { return this.blockedIps; }
    async allowPort(_port: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async denyPort(_port: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async setKv(_kv: any): Promise<void> {}
}

class MockConfig implements ConfigurationPort {
    getToken(): string | undefined { return undefined; }
    getMeshSecret(): string | undefined { return undefined; }
    getEnv(key: string): string | undefined { return undefined; }
    getNumber(key: string, def: number): number { return def; }
    getBoolean(key: string, def: boolean): boolean { return def; }
}

Deno.test("CuratedIntelService - Ingestion and Scoring", async () => {
    const logging = new MockLoggingPort();
    const firewall = new MockFirewallPort();
    const config = new MockConfig();
    const service = new CuratedIntelService(logging, firewall, config);
    const kv = await Deno.openKv(":memory:");

    // Mock Abuse.ch data (CSV)
    const mockCsv = `"id","ip","status"\n"1","10.10.10.10","online"`;
    const fetchStub = stub(globalThis, "fetch", () => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockCsv)
    } as any));

    try {
        // We only want to test Abuse.ch
        (service as any).sources = [{ name: "Abuse.ch", url: "http://example.com", type: "IP" }];

        await service.start(kv);

        // Wait for ingestion
        await new Promise(r => setTimeout(r, 200));

        const threats = await service.getThreats();
        // 2 threats if boot sync and background sync both ran
        assertEquals(threats.threats.length >= 1, true);
        assertEquals(threats.threats[0].indicator, "10.10.10.10");

        // Abuse.ch weight is 95. score >= 95 triggers autonomous block.
        // It might be called multiple times due to boot sync and initial sync
        assertEquals(firewall.blockedIps.includes("10.10.10.10"), true);
        assertEquals(logging.logs.some(l => l.message.includes("Autonomous Isolation engaged")), true);

    } finally {
        fetchStub.restore();
        await service.shutdown();
        kv.close();
    }
});

Deno.test("CuratedIntelService - GeoIP Location Enrichment on getThreats", async () => {
    const logging = new MockLoggingPort();
    const firewall = new MockFirewallPort();
    const config = new MockConfig();
    const geoip = new GeoIpService(logging);
    const service = new CuratedIntelService(logging, firewall, config, geoip);
    const kv = await Deno.openKv(":memory:");

    try {
        await service.start(kv);

        // Save an IP threat in KV WITHOUT geo data
        const threat = {
            indicator: "198.51.100.42",
            type: "IP",
            provider: "TestProvider",
            score: 75,
            confidence: 80,
            threatType: "Test Threat",
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            ttl: 24
        };
        await kv.set(["curated_threats", "198.51.100.42"], threat);

        // Fetch threats with type=IP and provider=TestProvider
        const result = await service.getThreats({ type: "IP", provider: "TestProvider" });
        assertEquals(result.threats.length, 1);
        const fetched = result.threats[0];
        assertEquals(fetched.indicator, "198.51.100.42");
        assertExists(fetched.geo);
        assertExists(fetched.geo.lat);
        assertExists(fetched.geo.lon);
        assertExists(fetched.geo.country);
        assertExists(fetched.geo.isp);
    } finally {
        await service.shutdown();
        kv.close();
    }
});

Deno.test("CuratedIntelService - Database wipe and stats", async () => {
    const logging = new MockLoggingPort();
    const firewall = new MockFirewallPort();
    const config = new MockConfig();
    const service = new CuratedIntelService(logging, firewall, config);
    const kv = await Deno.openKv(":memory:");

    try {
        await service.start(kv);

        // Add a manual threat
        const threat = { indicator: "1.1.1.1", type: "IP", provider: "Manual", score: 50, ttl: 1 };
        await kv.set(["curated_threats", "1.1.1.1"], threat);

        const stats = await service.getStats();
        assertExists(stats);

        await service.wipeDatabase();
        const threats = await service.getThreats();
        assertEquals(threats.threats.length, 0);

    } finally {
        await service.shutdown();
        kv.close();
    }
});
