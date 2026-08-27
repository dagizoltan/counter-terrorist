/**
 * MaxMind DB (.mmdb) reader — pure TypeScript, no dependencies, no network.
 *
 * Implements the MaxMind DB File Format v2 well enough to resolve an IP address
 * to its stored record: metadata parse, binary search-tree walk (24/28/32-bit
 * records), and the data-section decoder (maps, arrays, strings, numbers,
 * booleans, pointers). This is what lets the Sovereign orchestrator do real,
 * offline GeoIP against a locally provisioned database (DB-IP Lite,
 * IP2Location LITE, or MaxMind GeoLite2) instead of inventing coordinates.
 *
 * Spec: https://maxmind.github.io/MaxMind-DB/
 *
 * Scope: read-only lookups. It decodes the value types that appear in city /
 * country / ASN databases. Unknown or malformed input fails closed (returns
 * null / throws on open), never a fabricated answer.
 */

const METADATA_MARKER = new Uint8Array([
  0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63, 0x6f, 0x6d,
]); // "\xab\xcd\xefMaxMind.com"
const DATA_SECTION_SEPARATOR = 16;

export interface MmdbMetadata {
  nodeCount: number;
  recordSize: number; // bits: 24, 28 or 32
  ipVersion: number; // 4 or 6
  databaseType: string;
  buildEpoch: number;
}

// deno-lint-ignore no-explicit-any
export type MmdbRecord = Record<string, any>;

export class MmdbReader {
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  readonly metadata: MmdbMetadata;
  private readonly nodeByteSize: number;
  private readonly searchTreeSize: number;
  private readonly dataSectionStart: number;
  private ipv4StartNode = -1;

  private constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.metadata = this.readMetadata();
    this.nodeByteSize = (this.metadata.recordSize * 2) / 8;
    this.searchTreeSize = this.metadata.nodeCount * this.nodeByteSize;
    this.dataSectionStart = this.searchTreeSize + DATA_SECTION_SEPARATOR;
  }

  /** Read a database from disk. Throws if the file is missing or not an mmdb. */
  static async open(path: string): Promise<MmdbReader> {
    const buf = await Deno.readFile(path);
    return new MmdbReader(buf);
  }

  /** Build a reader from an in-memory buffer (used by tests and provisioning). */
  static fromBuffer(buf: Uint8Array): MmdbReader {
    return new MmdbReader(buf);
  }

  /** Resolve an IPv4 or IPv6 address to its record, or null if not found. */
  lookup(ip: string): MmdbRecord | null {
    const addr = parseIp(ip);
    if (!addr) return null;

    let bits: number[];
    if (addr.length === 4) {
      if (this.metadata.ipVersion === 4) {
        bits = bytesToBits(addr);
      } else {
        // IPv4 in an IPv6 database lives in the ::/96 subtree. Walk 96 zero
        // bits once (cached), then the 32 address bits.
        bits = bytesToBits(addr);
        const start = this.ipv4Start();
        if (start < 0) return null;
        return this.walkFrom(start, bits);
      }
    } else {
      if (this.metadata.ipVersion === 4) return null; // v6 lookup in a v4 DB
      bits = bytesToBits(addr);
    }
    return this.walkFrom(0, bits);
  }

  private ipv4Start(): number {
    if (this.ipv4StartNode >= 0) return this.ipv4StartNode;
    let node = 0;
    for (let i = 0; i < 96 && node < this.metadata.nodeCount; i++) {
      node = this.readRecord(node, 0);
    }
    this.ipv4StartNode = node;
    return node;
  }

  private walkFrom(startNode: number, bits: number[]): MmdbRecord | null {
    let node = startNode;
    for (let i = 0; i < bits.length; i++) {
      if (node >= this.metadata.nodeCount) break;
      node = this.readRecord(node, bits[i]);
    }
    if (node === this.metadata.nodeCount) return null; // empty terminator
    if (node > this.metadata.nodeCount) {
      // Data pointer: offset into the file relative to the whole tree.
      const offset = node - this.metadata.nodeCount + this.searchTreeSize;
      return this.decode(offset).value as MmdbRecord;
    }
    return null;
  }

  /** Read one of a node's two records (which=0 left, which=1 right). */
  private readRecord(node: number, which: number): number {
    const base = node * this.nodeByteSize;
    const rs = this.metadata.recordSize;
    if (rs === 24) {
      const o = base + which * 3;
      return (this.buf[o] << 16) | (this.buf[o + 1] << 8) | this.buf[o + 2];
    }
    if (rs === 32) {
      const o = base + which * 4;
      return (this.buf[o] * 0x1000000) + (this.buf[o + 1] << 16) + (this.buf[o + 2] << 8) + this.buf[o + 3];
    }
    // 28-bit: the middle byte's nibbles carry the high 4 bits of each record.
    const mid = this.buf[base + 3];
    if (which === 0) {
      return ((mid >> 4) << 24) | (this.buf[base] << 16) | (this.buf[base + 1] << 8) | this.buf[base + 2];
    }
    return ((mid & 0x0f) << 24) | (this.buf[base + 4] << 16) | (this.buf[base + 5] << 8) | this.buf[base + 6];
  }

  private readMetadata(): MmdbMetadata {
    const start = this.findMetadataStart();
    // The metadata is a data-section map, decoded with offsets relative to it.
    const saved = this.metaBase;
    this.metaBase = start;
    const { value } = this.decode(start);
    this.metaBase = saved;
    const m = value as MmdbRecord;
    const recordSize = Number(m.record_size);
    if (![24, 28, 32].includes(recordSize)) {
      throw new Error(`mmdb: unsupported record_size ${recordSize}`);
    }
    return {
      nodeCount: Number(m.node_count),
      recordSize,
      ipVersion: Number(m.ip_version),
      databaseType: String(m.database_type ?? "unknown"),
      buildEpoch: Number(m.build_epoch ?? 0),
    };
  }

  private findMetadataStart(): number {
    // The marker's LAST occurrence begins the metadata block.
    for (let i = this.buf.length - METADATA_MARKER.length; i >= 0; i--) {
      let hit = true;
      for (let j = 0; j < METADATA_MARKER.length; j++) {
        if (this.buf[i + j] !== METADATA_MARKER[j]) { hit = false; break; }
      }
      if (hit) return i + METADATA_MARKER.length;
    }
    throw new Error("mmdb: metadata marker not found — not a MaxMind database");
  }

  // Pointer bases differ: within the search-tree/data body they are relative to
  // the data section; while decoding metadata they are relative to the metadata
  // block. metaBase carries that base (0 = normal data-section mode).
  private metaBase = 0;

  private decode(offset: number): { value: unknown; next: number } {
    const ctrl = this.buf[offset];
    let type = ctrl >> 5;
    let cursor = offset + 1;

    if (type === 0) {
      // Extended type: real type is 7 + next byte.
      type = 7 + this.buf[cursor];
      cursor += 1;
    }

    if (type === 1) return this.decodePointer(ctrl, cursor);

    // Size from the low 5 bits, with the extended-size ladder.
    let size = ctrl & 0x1f;
    if (size === 29) { size = 29 + this.buf[cursor]; cursor += 1; }
    else if (size === 30) { size = 285 + ((this.buf[cursor] << 8) | this.buf[cursor + 1]); cursor += 2; }
    else if (size === 31) {
      size = 65821 + ((this.buf[cursor] << 16) | (this.buf[cursor + 1] << 8) | this.buf[cursor + 2]);
      cursor += 3;
    }

    switch (type) {
      case 2: return { value: utf8(this.buf.subarray(cursor, cursor + size)), next: cursor + size };
      case 3: return { value: this.view.getFloat64(cursor), next: cursor + size }; // double (size 8)
      case 4: return { value: this.buf.slice(cursor, cursor + size), next: cursor + size }; // bytes
      case 5: case 6: case 9: case 10: return { value: this.readUint(cursor, size), next: cursor + size };
      case 7: return this.decodeMap(cursor, size);
      case 8: return { value: this.readInt32(cursor, size), next: cursor + size };
      case 11: return this.decodeArray(cursor, size);
      case 14: return { value: size !== 0, next: cursor }; // boolean
      case 15: return { value: this.view.getFloat32(cursor), next: cursor + size }; // float (size 4)
      default: return { value: null, next: cursor + size };
    }
  }

  private decodePointer(ctrl: number, cursor: number): { value: unknown; next: number } {
    const pSize = (ctrl >> 3) & 0x3;
    let target: number;
    let next: number;
    if (pSize === 0) {
      target = ((ctrl & 0x7) << 8) | this.buf[cursor];
      next = cursor + 1;
    } else if (pSize === 1) {
      target = ((ctrl & 0x7) << 16) | (this.buf[cursor] << 8) | this.buf[cursor + 1];
      target += 2048;
      next = cursor + 2;
    } else if (pSize === 2) {
      target = ((ctrl & 0x7) << 24) | (this.buf[cursor] << 16) | (this.buf[cursor + 1] << 8) | this.buf[cursor + 2];
      target += 526336;
      next = cursor + 3;
    } else {
      target = (this.buf[cursor] * 0x1000000) + (this.buf[cursor + 1] << 16) + (this.buf[cursor + 2] << 8) + this.buf[cursor + 3];
      next = cursor + 4;
    }
    const base = this.metaBase || this.dataSectionStart;
    const { value } = this.decode(base + target);
    return { value, next };
  }

  private decodeMap(cursor: number, size: number): { value: MmdbRecord; next: number } {
    const out: MmdbRecord = {};
    let c = cursor;
    for (let i = 0; i < size; i++) {
      const k = this.decode(c);
      const v = this.decode(k.next);
      out[String(k.value)] = v.value;
      c = v.next;
    }
    return { value: out, next: c };
  }

  private decodeArray(cursor: number, size: number): { value: unknown[]; next: number } {
    const out: unknown[] = [];
    let c = cursor;
    for (let i = 0; i < size; i++) {
      const v = this.decode(c);
      out.push(v.value);
      c = v.next;
    }
    return { value: out, next: c };
  }

  private readUint(offset: number, size: number): number {
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + this.buf[offset + i];
    return v;
  }

  private readInt32(offset: number, size: number): number {
    let v = 0;
    for (let i = 0; i < size; i++) v = (v << 8) | this.buf[offset + i];
    return v | 0;
  }
}

const _utf8 = new TextDecoder("utf-8");
function utf8(bytes: Uint8Array): string {
  return _utf8.decode(bytes);
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = new Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 0; b < 8; b++) bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
  }
  return bits;
}

/** Parse an IPv4 or IPv6 literal into its network bytes, or null if invalid. */
export function parseIp(ip: string): Uint8Array | null {
  if (ip.includes(":")) return parseIpv6(ip);
  return parseIpv4(ip);
}

function parseIpv4(ip: string): Uint8Array | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    const n = Number(parts[i]);
    if (n > 255) return null;
    out[i] = n;
  }
  return out;
}

function parseIpv6(ip: string): Uint8Array | null {
  // Reject an embedded IPv4 tail for now (rare in threat feeds); handle the
  // hextet form, including a single "::" run.
  if (ip.includes(".")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups: number[] = [];
  for (const h of head) { const n = hextet(h); if (n < 0) return null; groups.push(n); }
  const tailGroups: number[] = [];
  for (const h of tail) { const n = hextet(h); if (n < 0) return null; tailGroups.push(n); }

  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    for (let i = 0; i < fill; i++) groups.push(0);
    groups.push(...tailGroups);
  }
  if (groups.length !== 8) return null;

  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) { out[i * 2] = groups[i] >> 8; out[i * 2 + 1] = groups[i] & 0xff; }
  return out;
}

function hextet(h: string): number {
  if (!/^[0-9a-fA-F]{1,4}$/.test(h)) return -1;
  return parseInt(h, 16);
}
