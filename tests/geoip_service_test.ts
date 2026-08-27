/**
 * GeoIP service tests.
 *
 * The service must give real attribution when a database is provisioned and an
 * honest, plainly-flagged estimate when it is not — and in estimate mode it must
 * NOT invent a country or city (the defect that put fabricated flags on the
 * threat map). These tests drive both paths: a real lookup against a temp MMDB
 * written from the shared fixture, the RIR estimate with no database, plus the
 * caching contract the service has always carried.
 */
import { assert, assertEquals } from "@std/assert";
import { GeoIpService } from "@domain/analysis/geoip_service.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";
import { buildTestMmdb } from "./mmdb_fixture.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    // deno-lint-ignore no-explicit-any
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    // deno-lint-ignore no-explicit-any
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

async function withDb<T>(fn: (path: string) => Promise<T>): Promise<T> {
    const path = await Deno.makeTempFile({ suffix: ".mmdb" });
    await Deno.writeFile(path, buildTestMmdb());
    const prev = Deno.env.get("CTS_GEOIP_DB");
    Deno.env.set("CTS_GEOIP_DB", path);
    try {
        return await fn(path);
    } finally {
        if (prev === undefined) Deno.env.delete("CTS_GEOIP_DB"); else Deno.env.set("CTS_GEOIP_DB", prev);
        await Deno.remove(path).catch(() => {});
    }
}

async function withoutDb<T>(fn: () => Promise<T>): Promise<T> {
    const prev = Deno.env.get("CTS_GEOIP_DB");
    Deno.env.set("CTS_GEOIP_DB", "/nonexistent/geoip.mmdb");
    try {
        return await fn();
    } finally {
        if (prev === undefined) Deno.env.delete("CTS_GEOIP_DB"); else Deno.env.set("CTS_GEOIP_DB", prev);
    }
}

Deno.test("resolves real attribution against a provisioned database", async () => {
    await withDb(async () => {
        const svc = new GeoIpService(new MockLoggingPort());
        const intel = await svc.lookup("0.0.0.0");
        assert(svc.hasDatabase(), "database should be loaded");
        assertEquals(intel.country, "US");
        assertEquals(intel.city, "New York");
        assertEquals(intel.precision, "city");
        assertEquals(intel.provisional, false);
        assertEquals(Math.round(intel.lat * 1e4) / 1e4, 40.7128);
        assert(intel.tags.includes("GEOIP_DB"));
    });
});

Deno.test("country-only records report country precision", async () => {
    await withDb(async () => {
        const svc = new GeoIpService(new MockLoggingPort());
        const intel = await svc.lookup("200.1.2.3");
        assertEquals(intel.country, "DE");
        assertEquals(intel.city, "");
        assertEquals(intel.precision, "country");
        assertEquals(intel.provisional, false);
    });
});

Deno.test("estimates by region without a database — and never fabricates a country", async () => {
    await withoutDb(async () => {
        const svc = new GeoIpService(new MockLoggingPort());
        const intel = await svc.lookup("80.1.2.3"); // RIPE range
        assert(!svc.hasDatabase(), "no database should be loaded");
        assertEquals(intel.precision, "estimated");
        assertEquals(intel.provisional, true);
        assertEquals(intel.country, "", "estimate must not invent a country");
        assertEquals(intel.city, "", "estimate must not invent a city");
        assertEquals(intel.isp, "");
        assertEquals(intel.region, "Europe / Eurasia");
        assert(Number.isFinite(intel.lat) && Number.isFinite(intel.lon));
        assert(intel.tags.includes("RIR_ESTIMATED"));
    });
});

Deno.test("APAC, Americas, LATAM and Africa ranges estimate to their real region", async () => {
    await withoutDb(async () => {
        const svc = new GeoIpService(new MockLoggingPort());
        assertEquals((await svc.lookup("1.1.1.1")).region, "Asia-Pacific");
        assertEquals((await svc.lookup("8.8.8.8")).region, "North America");
        assertEquals((await svc.lookup("200.0.0.1")).region, "Latin America");
        assertEquals((await svc.lookup("41.0.0.1")).region, "Africa");
    });
});

Deno.test("lookups are cached and stable per IP", async () => {
    await withoutDb(async () => {
        const svc = new GeoIpService(new MockLoggingPort());
        const a = await svc.lookup("1.2.3.4");
        const b = await svc.lookup("1.2.3.4");
        assertEquals(a.region, b.region);
        assertEquals(a.lat, b.lat);
        await svc.lookup("8.8.8.8");
        assertEquals(Object.keys(svc.getCache()).length, 2);
    });
});
