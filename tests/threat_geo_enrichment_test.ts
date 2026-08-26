import { assert, assertEquals } from "@std/assert";
import { EventMediator } from "../src/orchestrator/domain/analysis/event_mediator.ts";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { serviceLocator } from "@core/service_locator.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
  enableGlobalIntercept(): void {}
  async log(_entry: LogEntry): Promise<void> {}
  async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return []; }
  async logLegacy(): Promise<void> {}
  setKv(_kv: unknown): void {}
  async shutdown(): Promise<void> {}
}

/** Records the ips it was asked to locate, and returns a fixed provisional fix. */
class StubGeoIp {
  seen: string[] = [];
  async lookup(ip: string) {
    this.seen.push(ip);
    return { ip, country: "DE", city: "Frankfurt", asn: "AS1", isp: "Carrier", lat: 50.1, lon: 8.7, threatScore: 60, lastSeen: "", tags: [] };
  }
}

function mediator() {
  const bus = new EventBus(new MockLoggingPort());
  const m = new EventMediator(bus, () => {}, new MockLoggingPort());
  return { m, bus };
}

Deno.test("a located THREAT is enriched from the GeoIP resolver, not the client", async () => {
  const geo = new StubGeoIp();
  serviceLocator.register("geoIp", geo as never);
  const { m, bus } = mediator();

  const out = await m.enrichThreatGeo({ type: "THREAT", data: { indicator: "203.0.113.9", threatType: "C2" } } as never);
  const g = (out as { data: { geo?: { lat?: number; lon?: number; city?: string } } }).data.geo;

  assertEquals(geo.seen, ["203.0.113.9"], "the indicator should have been resolved once");
  assert(g?.lat === 50.1 && g?.lon === 8.7, "resolved coordinates should be attached");
  assertEquals(g?.city, "Frankfurt");

  await bus.shutdown();
});

Deno.test("an already-located THREAT is left untouched (no second lookup)", async () => {
  const geo = new StubGeoIp();
  serviceLocator.register("geoIp", geo as never);
  const { m, bus } = mediator();

  const frame = { type: "THREAT", data: { indicator: "1.2.3.4", geo: { lat: 12, lon: 34 } } };
  const out = await m.enrichThreatGeo(frame as never);

  assertEquals(geo.seen, [], "a threat that already has coordinates must not be re-resolved");
  assertEquals((out as { data: { geo: { lat: number } } }).data.geo.lat, 12);

  await bus.shutdown();
});

Deno.test("a non-IP indicator is not given fabricated coordinates", async () => {
  const geo = new StubGeoIp();
  serviceLocator.register("geoIp", geo as never);
  const { m, bus } = mediator();

  const out = await m.enrichThreatGeo({ type: "THREAT", data: { indicator: "evil.example.com", threatType: "PHISH" } } as never);

  assertEquals(geo.seen, [], "a domain is not an IP — it must not be resolved to a point");
  assertEquals((out as { data: { geo?: unknown } }).data.geo, undefined);

  await bus.shutdown();
});

Deno.test("a non-THREAT frame passes through unchanged", async () => {
  const geo = new StubGeoIp();
  serviceLocator.register("geoIp", geo as never);
  const { m, bus } = mediator();

  const frame = { type: "NETWORK_LOG", data: { indicator: "9.9.9.9" } };
  const out = await m.enrichThreatGeo(frame as never);

  assertEquals(geo.seen, []);
  assertEquals(out, frame as never);

  await bus.shutdown();
});
