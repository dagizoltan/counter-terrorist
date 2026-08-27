/**
 * Test-only MaxMind DB fixture builder (not a test file itself).
 *
 * Encodes a tiny but spec-valid v4 / 24-bit-record database in memory so the
 * MMDB reader and the GeoIP service can be validated offline, without shipping
 * or downloading a real database. The tree maps:
 *   0.0.0.0    -> a full city record (US / New York, 40.7128,-74.006)
 *   200.x.x.x  -> a country-only record (DE / Germany), via shared pointers
 *   64.0.0.0   -> empty (no data)
 */

class DataBuilder {
  bytes: number[] = [];
  private strOffsets = new Map<string, number>();

  get length() { return this.bytes.length; }
  private push(...b: number[]) { for (const x of b) this.bytes.push(x & 0xff); }

  private ctrl(type: number, size: number) {
    if (size >= 29) throw new Error("fixture encoder only handles size<29");
    if (type <= 7) this.push((type << 5) | size);
    else this.push((0 << 5) | size, type - 7); // extended type
  }

  string(s: string): number {
    const at = this.length;
    const enc = new TextEncoder().encode(s);
    this.ctrl(2, enc.length);
    this.push(...enc);
    return at;
  }

  private sharedString(s: string) {
    if (!this.strOffsets.has(s)) this.strOffsets.set(s, this.string(s));
    else this.pointer(this.strOffsets.get(s)!);
  }

  pointer(target: number) {
    if (target >= 2048) throw new Error("fixture encoder pointer target too large");
    this.push((1 << 5) | (0 << 3) | ((target >> 8) & 0x7), target & 0xff);
  }

  double(n: number): number {
    const at = this.length;
    this.ctrl(3, 8);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, n);
    this.push(...b);
    return at;
  }

  uint(n: number, size: number): number {
    const at = this.length;
    this.ctrl(5, size);
    for (let i = size - 1; i >= 0; i--) this.push((n >> (i * 8)) & 0xff);
    return at;
  }

  bool(v: boolean): number { const at = this.length; this.ctrl(14, v ? 1 : 0); return at; }

  array(items: (() => void)[]): number {
    const at = this.length;
    this.ctrl(11, items.length);
    for (const it of items) it();
    return at;
  }

  map(entries: [string, () => void][]): number {
    const at = this.length;
    this.ctrl(7, entries.length);
    for (const [k, v] of entries) { this.sharedString(k); v(); }
    return at;
  }
}

const MARKER = [0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63, 0x6f, 0x6d];
const NODE_COUNT = 2;
const NODE_BYTES = 6;

function rec24(v: number): number[] { return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]; }
function dataRecordValue(dataRelOffset: number) { return NODE_COUNT + 16 + dataRelOffset; }

/** Build the test database bytes. */
export function buildTestMmdb(): Uint8Array {
  const data = new DataBuilder();

  const A_OFFSET = data.map([
    ["country", () => data.map([
      ["iso_code", () => data.string("US")],
      ["names", () => data.map([["en", () => data.string("United States")]])],
    ])],
    ["city", () => data.map([
      ["names", () => data.map([["en", () => data.string("New York")]])],
    ])],
    ["location", () => data.map([
      ["latitude", () => data.double(40.7128)],
      ["longitude", () => data.double(-74.006)],
      ["accuracy_radius", () => data.uint(20, 2)],
    ])],
    ["is_anonymous_proxy", () => data.bool(false)],
    ["subdivisions", () => data.array([() => data.string("NY")])],
  ]);

  // Country-level record: has an (approximate) location but no city — the real
  // shape a City database returns when it can only place an IP by country.
  const B_OFFSET = data.map([
    ["country", () => data.map([
      ["iso_code", () => data.string("DE")],
      ["names", () => data.map([["en", () => data.string("Germany")]])],
    ])],
    ["location", () => data.map([
      ["latitude", () => data.double(51.1657)],
      ["longitude", () => data.double(10.4515)],
    ])],
  ]);

  const tree: number[] = [
    ...rec24(1),                              // node0 left  -> node 1
    ...rec24(dataRecordValue(B_OFFSET)),      // node0 right -> data B
    ...rec24(dataRecordValue(A_OFFSET)),      // node1 left  -> data A
    ...rec24(NODE_COUNT),                      // node1 right -> empty
  ];

  const meta = new DataBuilder();
  meta.map([
    ["node_count", () => meta.uint(NODE_COUNT, 2)],
    ["record_size", () => meta.uint(24, 2)],
    ["ip_version", () => meta.uint(4, 1)],
    ["database_type", () => meta.string("Test-City")],
    ["build_epoch", () => meta.uint(1700000000 & 0xffffffff, 4)],
  ]);

  return new Uint8Array([
    ...tree,
    ...new Array(16).fill(0),
    ...data.bytes,
    ...MARKER,
    ...meta.bytes,
  ]);
}
