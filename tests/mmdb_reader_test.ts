/**
 * MMDB reader tests.
 *
 * A GeoIP reader that silently returns garbage is worse than one that returns
 * nothing — it puts an authoritative-looking wrong country on the threat map.
 * There is no real .mmdb in the sandbox, so these tests build a tiny but
 * spec-valid MaxMind database in memory (see mmdb_fixture.ts — maps, nested
 * maps, strings, doubles, uints, booleans, arrays and data pointers) and assert
 * the reader round-trips it and walks the search tree to the right records.
 */
import { assert, assertEquals } from "@std/assert";
import { MmdbReader, parseIp } from "../src/orchestrator/infrastructure/system/geoip/mmdb_reader.ts";
import { buildTestMmdb } from "./mmdb_fixture.ts";

const file = buildTestMmdb();

Deno.test("reader parses metadata", () => {
  const r = MmdbReader.fromBuffer(file);
  assertEquals(r.metadata.nodeCount, 2);
  assertEquals(r.metadata.recordSize, 24);
  assertEquals(r.metadata.ipVersion, 4);
  assertEquals(r.metadata.databaseType, "Test-City");
});

Deno.test("reader walks the tree to a full city record", () => {
  const r = MmdbReader.fromBuffer(file);
  const rec = r.lookup("0.0.0.0");
  assert(rec, "expected a record for 0.0.0.0");
  assertEquals(rec!.country.iso_code, "US");
  assertEquals(rec!.country.names.en, "United States");
  assertEquals(rec!.city.names.en, "New York");
  assertEquals(Math.round(rec!.location.latitude * 1e4) / 1e4, 40.7128);
  assertEquals(Math.round(rec!.location.longitude * 1e3) / 1e3, -74.006);
  assertEquals(rec!.location.accuracy_radius, 20);
  assertEquals(rec!.is_anonymous_proxy, false);
  assertEquals(rec!.subdivisions, ["NY"]);
});

Deno.test("reader resolves a different leaf and shared pointers", () => {
  const r = MmdbReader.fromBuffer(file);
  // 200.x = bit0 1 -> record B. Its keys ("country","names","en","iso_code")
  // are pointers into A's data; a correct record wins the round-trip.
  const rec = r.lookup("200.1.2.3");
  assert(rec, "expected a record for 200.1.2.3");
  assertEquals(rec!.country.iso_code, "DE");
  assertEquals(rec!.country.names.en, "Germany");
});

Deno.test("an address with no data returns null, never a guess", () => {
  const r = MmdbReader.fromBuffer(file);
  assertEquals(r.lookup("64.0.0.0"), null); // bit0=0,bit1=1 -> empty terminator
});

Deno.test("invalid input fails closed", () => {
  const r = MmdbReader.fromBuffer(file);
  assertEquals(r.lookup("not-an-ip"), null);
  assertEquals(r.lookup("999.1.1.1"), null);
});

Deno.test("IP parser handles v4 and compressed v6", () => {
  assertEquals(Array.from(parseIp("1.2.3.4")!), [1, 2, 3, 4]);
  assertEquals(parseIp("256.0.0.1"), null);
  const v6 = parseIp("2001:db8::1");
  assert(v6 && v6.length === 16);
  assertEquals(v6![0], 0x20); assertEquals(v6![1], 0x01);
  assertEquals(v6![15], 0x01);
  assertEquals(parseIp("::"), new Uint8Array(16));
});
