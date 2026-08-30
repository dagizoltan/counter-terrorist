/**
 * Centralized validation logic for security orchestrator.
 */
import { normalize, join, resolve, dirname } from "@std/path";
import { BloomFilter } from "../../core/cache.ts";
import { z } from "zod";

export const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

// PERFORMANCE: Hot-path caching for critical infrastructure lookups
const infrastructureCache = new BloomFilter(1024, 3);
const CRITICAL_IPS = [
  "1.1.1.1", "8.8.8.8", "8.8.4.4", // DNS
  "127.0.0.1", "::1",              // Loopback
];
CRITICAL_IPS.forEach(ip => infrastructureCache.add(ip));

export function isValidIP(ip: string): boolean {
  return IP_REGEX.test(ip);
}

/**
 * Checks if an IP is part of the critical infrastructure that should NEVER be blocked.
 */
export function isCriticalInfrastructure(ip: string): boolean {
  // 1. Fast Bloom Filter check (probabilistic)
  if (!infrastructureCache.has(ip)) {
      // Dynamic check for Gateway IP which might change
      // SEC-06 Hardening: Mediated access via Deno.env as validation is static
      const gateway = Deno.env.get("GATEWAY_IP");
      if (gateway && ip === gateway) return true;
      return false;
  }

  // 2. Slow path for confirmed matches (deterministic)
  const whitelist = [
    ...CRITICAL_IPS,
    Deno.env.get("GATEWAY_IP") || "", // Gateway
  ].filter(i => i !== "");

  return whitelist.includes(ip);
}

/**
 * Interface name validation pattern.
 * Only alphanumeric, hyphens, underscores, and dots are allowed.
 */
const INTERFACE_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Filename validation pattern for PCAP captures.
 * Only alphanumeric, dots, hyphens, and underscores. No path separators.
 */
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Validates a webhook URL to prevent SSRF attacks.
 * - Only HTTPS is allowed (HTTP rejected)
 * - Loopback, link-local, RFC1918 private ranges, and cloud metadata IPs are blocked
 * - DNS names that resolve to private IPs should be checked at fetch time
 */
export function isValidWebhookUrl(url: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // Only allow HTTPS
  if (parsed.protocol !== "https:") {
    return { valid: false, reason: `Scheme '${parsed.protocol}' is not allowed. Only HTTPS is permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block loopback and local-only variants
  if (hostname === "localhost" || hostname.startsWith("127.") || hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]" || hostname === "[::]") {
    return { valid: false, reason: "Loopback and local addresses are not allowed" };
  }

  // Block cloud metadata endpoints
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return { valid: false, reason: "Cloud metadata endpoints are not allowed" };
  }

  // Block link-local range (169.254.x.x)
  if (hostname.startsWith("169.254.")) {
    return { valid: false, reason: "Link-local addresses are not allowed" };
  }

  if (isPrivateIp(hostname)) {
    return { valid: false, reason: "Unauthorized private or internal IP address" };
  }

  return { valid: true };
}

/**
 * Checks if an IP address is private, loopback, or otherwise unauthorized for webhooks.
 */
export function isPrivateIp(ip: string): boolean {
  // URL.hostname keeps the brackets on an IPv6 literal ("[fe80::1]"), so every check
  // below has to run against the unbracketed form. Matching on the raw value let
  // https://[fe80::1]/, https://[::ffff:127.0.0.1]/ and https://[0:0:0:0:0:0:0:1]/ walk
  // straight past the webhook SSRF guard.
  const host = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;

  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return true;
  }

  if (host.startsWith("169.254.")) {
    return true;
  }

  const lowerIp = host.toLowerCase();

  const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 0) return true;
    return false;
  }

  // Only classify as IPv6 when the value actually is one. The old prefix tests ran on
  // any string, so ordinary hostnames beginning "fc"/"fd" were reported private.
  //
  // IPv4-mapped forms are handled by the full parser rather than by string-slicing after
  // "::ffff:": the URL parser rewrites "[::ffff:127.0.0.1]" to "[::ffff:7f00:1]", and a
  // textual shortcut left that hex spelling unclassified.
  if (!lowerIp.includes(":")) return false;

  return isPrivateIpv6(lowerIp);
}

/**
 * Classifies an unbracketed, lower-cased IPv6 literal as private/unroutable.
 * Covers loopback (::1), unspecified (::), link-local (fe80::/10) and unique-local
 * (fc00::/7) — including their fully expanded spellings.
 */
function isPrivateIpv6(addr: string): boolean {
  const groups = expandIpv6(addr);
  if (!groups) {
    // Unparseable: fall back to the conservative textual prefixes rather than allowing it.
    return addr === "::" || addr === "::1" || /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr);
  }

  if (groups.every((g) => g === 0)) return true;                       // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1

  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true;  // fc00::/7  unique-local
  if ((first & 0xffc0) === 0xfe80) return true;  // fe80::/10 link-local

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms carry the address in the
  // last two groups.
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    const a = groups[6] >> 8, b = groups[6] & 0xff, c = groups[7] >> 8, d = groups[7] & 0xff;
    if (a !== 0 || b !== 0 || c !== 0 || d !== 0) {
      return isPrivateIp(`${a}.${b}.${c}.${d}`);
    }
  }

  return false;
}

/** Expands an IPv6 literal (with optional "::" and trailing dotted-quad) to 8 groups. */
function expandIpv6(addr: string): number[] | null {
  let text = addr;

  // Strip a zone id ("fe80::1%eth0").
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  // A trailing dotted-quad becomes two hex groups.
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const octets = dotted.slice(1).map(Number);
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    text = text.slice(0, dotted.index) + `${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parse(halves[0]);
  if (head === null) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;

  const tail = parse(halves[1]);
  if (tail === null) return null;

  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array(fill).fill(0), ...tail];
}

/**
 * Validates a webhook URL asynchronously, performing DNS resolution to prevent DNS rebinding.
 */
export async function validateWebhookUrlAsync(url: string): Promise<{ valid: boolean; reason?: string; resolvedIp?: string }> {
  const initialCheck = isValidWebhookUrl(url);
  if (!initialCheck.valid) return initialCheck;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  const hostname = parsed.hostname;

  // If it's already an IP, it was already checked by isValidWebhookUrl (which calls isPrivateIp)
  if (IP_REGEX.test(hostname)) {
    return { valid: true, resolvedIp: hostname };
  }

  try {
    // Both families, not just A: a name with only — or additionally — an AAAA record
    // pointing at fe80::/fc00::/::1 used to skip the check entirely, since an A-only
    // lookup either threw (and was reported as a resolution failure) or returned the
    // one public address while the request could still be made over IPv6.
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
    ]);
    const ips = [...a, ...aaaa];

    if (ips.length === 0) {
      return { valid: false, reason: "Could not resolve hostname" };
    }

    // Check all resolved IPs
    for (const resolvedIp of ips) {
        if (isPrivateIp(resolvedIp)) {
            return { valid: false, reason: `Hostname resolves to unauthorized IP: ${resolvedIp}` };
        }
    }

    return { valid: true, resolvedIp: ips[0] };
  } catch (e) {
    // If DNS resolution fails, we block it to be safe
    return { valid: false, reason: `DNS resolution failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const ALLOWED_SIDECARS = ["analyzer", "enforcer", "decoy", "netcap", "watchfile", "trustroot", "tunnel", "mesh", "firewall", "sentinel-darwin", "enforcer-win", "telemetry-win", "sentinel"] as const;
export type SidecarName = typeof ALLOWED_SIDECARS[number];

export function isAllowedSidecar(name: string): name is SidecarName {
  return (ALLOWED_SIDECARS as readonly string[]).includes(name);
}

/**
 * Validates a filesystem path to prevent traversal and prefix bypass.
 * Ensures the path is within allowed boundaries if a jail is provided.
 *
 * SOV-M6: Harden against symlink jailbreaks (Audit 14.1).
 */
export function validatePath(p: string, jailPrefixes?: string[]): boolean {
  if (typeof p !== "string" || p.length === 0) return false;

  // 1. URL Decode to catch encoded bypasses (e.g. %2e%2e, %252e%252e)
  let decoded = p;
  try {
    // Limit decoding iterations to prevent CPU-based DoS
    let previous;
    let iterations = 0;
    do {
      previous = decoded;
      decoded = decodeURIComponent(decoded);
      iterations++;
    } while (decoded !== previous && iterations < 3);
  } catch {
    // If decoding fails, we still proceed with the original string but it's suspicious
  }

  // 2. Detect and reject null-byte injections
  if (decoded.includes("\0") || p.includes("\0")) return false;

  // 3. Reject obvious traversal and prefix bypasses
  if (decoded.includes("..") || p.includes("..") || p.startsWith("//") || p.startsWith("\\\\") || decoded.startsWith("//") || decoded.startsWith("\\\\")) return false;

  let normalized: string;
  try {
    normalized = normalize(p);
    if (normalized.includes("..")) return false;
  } catch {
    return false;
  }

  // 4. Harden against symlink jailbreaks (Audit 14.1)
  // We resolve the real path and ensure it's still within the jail.
  let realPath: string;
  try {
      // Use Deno.realPathSync to resolve all symlinks
      realPath = Deno.realPathSync(normalized);
  } catch {
      // If file doesn't exist, we must still resolve the directory hierarchy to catch symlink escapes.
      // e.g. /jail/evil_link/new_file where evil_link -> /etc
      try {
          const dir = dirname(normalized);
          const realDir = Deno.realPathSync(dir);
          realPath = join(realDir, normalized.split(/[\\/]/).pop() || "");
      } catch {
          // Both file and parent dir don't exist, fallback to absolute resolve.
          // This is high-risk but better than nothing.
          realPath = resolve(normalized);
      }
  }

  if (jailPrefixes && jailPrefixes.length > 0) {
    const isInside = jailPrefixes.some(jail => {
        const normalizedJail = resolve(jail);
        const resolvedP = resolve(realPath);

        // Ensure both ends with slash for prefix check
        const jailBoundary = normalizedJail.endsWith("/") ? normalizedJail : normalizedJail + "/";
        const pathToCheck = resolvedP.endsWith("/") ? resolvedP : resolvedP + "/";

        return pathToCheck.startsWith(jailBoundary) || resolvedP === normalizedJail;
    });
    if (!isInside) return false;
  }

  // B-09: Refined boundary check to prevent prefix bypass (e.g. /tmp-malicious)
  if (normalized.includes("..")) return false;

  return true;
}

// IPC Schemas
export interface BaseRequest {
  id?: string;
  type: string;
}

export interface ScannerRequest extends BaseRequest {
  type: "SCAN" | "DIR_SCAN" | "RKH_SCAN" | "QUIT" | "MEM_SCAN" | "ScanPath" | "Quarantine" | "SyncSignatures" | "GetStatus";
  path?: string;
  paths?: string[];
}

export interface BlockerRequest extends BaseRequest {
  type: "KillProcess" | "BlockIp" | "UnblockIp" | "QuarantineProcess" | "DumpProcess" | "GetStatus";
  pid?: number;
  ip?: string;
  path?: string;
}

export interface PcapRequest extends BaseRequest {
  type: "StartCapture" | "StopCapture";
  interface?: string;
  duration?: number;
  filename?: string;
}

export interface SidecarResponse {
  id?: string;
  success?: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
  data?: Record<string, any>;
  timestamp?: string;
  event?: string;
  type?: string;
  sidecar?: string;
  critical?: boolean;
  error?: string;
}

export interface ScannerResponse extends SidecarResponse {
  processes?: Array<{
    pid: number;
    ppid: number;
    name: string;
    exe_path: string;
    hash: string;
    cpu_usage: number;
    memory_usage: number;
  }>;
  system_load?: number;
  files?: Array<{
    path: string;
    hash: string;
    mtime: string;
  }>;
}

export interface BlockerResponse extends SidecarResponse {
  // message and success are enough
}

export interface PcapResponse extends SidecarResponse {
  // message and success are enough
}

export interface SidecarEvent {
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

// Validation functions

let comparisonKeyPromise: Promise<CryptoKey> | null = null;

/**
 * Gets or generates the HMAC key for constant-time comparisons.
 * Uses a Promise to avoid race conditions during initialization.
 */
function getComparisonKey(): Promise<CryptoKey> {
  if (!comparisonKeyPromise) {
    comparisonKeyPromise = crypto.subtle.generateKey(
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }
  return comparisonKeyPromise;
}

/**
 * Constant-time comparison using HMAC to prevent timing attacks.
 * It hashes both inputs with HMAC-SHA256 using a per-process random key,
 * ensuring fixed-length outputs and preventing timing attack vectors.
 * This version avoids early returns for undefined inputs to maintain consistent timing.
 */
export async function secureCompare(a: string | undefined, b: string | undefined): Promise<boolean> {
  const key = await getComparisonKey();
  const encoder = new TextEncoder();

  // Use dummy values if undefined to ensure HMAC operations are always performed
  const aData = encoder.encode(a ?? "");
  const bData = encoder.encode(b ?? "");

  const aMac = new Uint8Array(await crypto.subtle.sign("HMAC", key, aData));
  const bMac = new Uint8Array(await crypto.subtle.sign("HMAC", key, bData));

  const result = secureCompareBytes(aMac, bMac);

  // Ensure we return false if either input was undefined, but only after HMAC operations
  return result && a !== undefined && b !== undefined;
}

/**
 * Constant-time comparison of two Uint8Arrays to prevent timing attacks.
 * This implementation avoids early returns based on content to mitigate timing leaks.
 * Note: It still returns early if lengths differ, which is safe when comparing fixed-length hashes.
 */
export function secureCompareBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  // Constant-time bitwise comparison
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

const SCANNER_JAIL = ["/home/", "/var/www/", "./volume/", "/var/lib/cts/", "/tmp/"];

// Shared Zod Primitives
const IdSchema = z.string().nullable().optional();
const PidSchema = z.number().int().positive();
const PortSchema = z.number().int().min(1).max(65535);
const IpSchema = z.string().refine(isValidIP, { message: "Invalid IP address" });
const NonCriticalIpSchema = IpSchema.refine(ip => !isCriticalInfrastructure(ip), { message: "Cannot block critical infrastructure" });
const PathSchema = (jail?: string[]) => z.string().refine(p => validatePath(p, jail), { message: "Invalid or prohibited filesystem path" });
const InterfaceSchema = z.string().regex(INTERFACE_NAME_REGEX);

const AuditEventSchema = z.object({
    type: z.string(),
    message: z.string(),
    timestamp: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    severity: z.string().optional(),
    caller: z.string().optional()
});

const AnalyzerRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["SCAN", "DIR_SCAN", "RKH_SCAN", "QUIT", "MEM_SCAN", "ScanPath", "Quarantine", "SyncSignatures", "GetStatus"]),
    path: PathSchema(SCANNER_JAIL).optional(),
    paths: z.array(PathSchema(SCANNER_JAIL)).optional()
});

const EnforcerRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["KillProcess", "BlockIp", "UnblockIp", "QuarantineProcess", "DumpProcess", "GetStatus"]),
    pid: PidSchema.optional(),
    ip: IpSchema.optional(),
    path: PathSchema().optional()
}).refine(data => {
    if (["KillProcess", "QuarantineProcess", "DumpProcess"].includes(data.type) && data.pid === undefined) return false;
    if (data.type === "BlockIp" && (data.ip === undefined || isCriticalInfrastructure(data.ip))) return false;
    if (data.type === "UnblockIp" && data.ip === undefined) return false;
    return true;
}, { message: "Missing required fields for enforcer command" });

/**
 * PCAP output paths are jailed to the capture directories.
 *
 * The previous check only inspected the trailing path component, so
 * "../../../etc/cron.d/evil" passed (basename "evil") and netcap — which hands the
 * string straight to File::create while holding CAP_NET_RAW — would happily create it.
 * Both the basename and the full resolved path are checked now.
 */
const PCAP_JAIL = ["./volume/storage/captures/", "./volume/storage/forensics/", "/var/lib/cts/captures/", "/var/lib/cts/forensics/"];

const PcapFilenameSchema = z.string().refine(f => {
    const basename = f.split("/").pop()?.split("\\").pop() || "";
    if (!SAFE_FILENAME_REGEX.test(basename) || basename === "." || basename === "..") return false;
    // A bare filename (no separator) is written relative to the agent's own cwd.
    if (!f.includes("/") && !f.includes("\\")) return true;
    return validatePath(f, PCAP_JAIL);
}, { message: "Unsafe PCAP filename" });

// netcap reads its arguments from a nested `payload` object; the pcap providers send
// them flat. Accept either spelling and validate whichever one is present, so neither
// caller can smuggle an unvalidated filename through the shape the schema ignores.
const NetcapRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["StartCapture", "StopCapture", "GetStatus"]),
    interface: InterfaceSchema.optional(),
    duration: z.number().min(1).max(3600).optional(),
    filename: PcapFilenameSchema.optional(),
    payload: z.object({
        interface: InterfaceSchema.optional(),
        duration: z.number().min(1).max(3600).optional(),
        filename: PcapFilenameSchema.optional()
    }).optional()
});

const DecoyRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["ToggleModule", "UpdateModule", "Sabotage", "GetStatus"]),
    module: z.string().optional(),
    port: PortSchema.optional(),
    newPort: PortSchema.optional(),
    source_ip: IpSchema.optional()
});

const WatchfileRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["WatchPath", "UnwatchPath", "GetStatus"]),
    path: PathSchema().optional()
});

const SentinelRequestSchema = z.object({
    id: IdSchema,
    type: z.enum([
        "BLOCK_IP", "UNBLOCK_IP", "SHADOW_BAN", "HIDE_PID", "GET_STATUS", 
        "ALLOW_PORT", "DENY_PORT", "FLUSH_RULES", "LOCKDOWN", "SHUTDOWN", "TRUST_COMM", "TRUST_PID",
        "ENFORCE_PID", "UNENFORCE_PID", "KillProcess", "QuarantineProcess", "DumpProcess"
    ]),
    ip: IpSchema.optional(),
    pid: PidSchema.optional(),
    port: PortSchema.optional(),
    comm: z.string().optional(),
    path: PathSchema().optional()
}).refine(data => {
    if (data.type === "BLOCK_IP" && (data.ip === undefined || isCriticalInfrastructure(data.ip))) return false;
    if (["UNBLOCK_IP", "SHADOW_BAN"].includes(data.type) && data.ip === undefined) return false;
    if (["HIDE_PID", "ENFORCE_PID", "UNENFORCE_PID", "TRUST_PID", "KillProcess", "QuarantineProcess", "DumpProcess"].includes(data.type) && data.pid === undefined) return false;
    if (["ALLOW_PORT", "DENY_PORT"].includes(data.type) && data.port === undefined) return false;
    if (data.type === "TRUST_COMM" && data.comm === undefined) return false;
    return true;
}, { message: "Missing required fields for sentinel command" });

const TrustrootRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["Seal", "Unseal", "Sign", "Verify", "GetPcrs", "NvDefine", "NvWrite", "NvRead", "QuoteIdentity", "GenerateSelfSignedCA", "IssueNodeCert", "GenerateProxyKey", "SignProxy", "WipeSecrets"])
});

const TunnelRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["CONNECT", "DISCONNECT", "GET_STATUS"])
});

const SentinelDarwinRequestSchema = z.object({
    id: IdSchema,
    type: z.enum([
        "BlockIp", "UnblockIp", "ShadowBanIp", "AllowPort", "DenyPort",
        "Lockdown", "FlushRules", "GetStatus", "UpdatePolicy"
    ]),
    ip: IpSchema.optional(),
    port: PortSchema.optional()
}).refine(data => {
    if (data.type === "BlockIp" && (data.ip === undefined || isCriticalInfrastructure(data.ip))) return false;
    if (["UnblockIp", "ShadowBanIp"].includes(data.type) && data.ip === undefined) return false;
    if (["AllowPort", "DenyPort"].includes(data.type) && data.port === undefined) return false;
    return true;
});

const EnforcerWinRequestSchema = z.object({
    id: IdSchema,
    type: z.enum([
        "AddBlockRule", "RemoveBlockRule", "AddAllowRule", "RemoveAllowRule",
        "ProtectDirectory", "GetStatus", "FlushRules"
    ]),
    ip: IpSchema.optional(),
    port: PortSchema.optional()
}).refine(data => {
    if (data.type === "AddBlockRule" && (data.ip === undefined || isCriticalInfrastructure(data.ip))) return false;
    if (data.type === "RemoveBlockRule" && data.ip === undefined) return false;
    if (["AddAllowRule", "RemoveAllowRule"].includes(data.type) && data.port === undefined) return false;
    return true;
});

const FirewallRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["KillProcess", "BlockIp", "UnblockIp", "QuarantineProcess", "DumpProcess", "GetStatus", "FlushRules", "Lockdown", "AllowPort", "DenyPort"]),
    pid: PidSchema.optional(),
    ip: IpSchema.optional(),
    port: PortSchema.optional(),
    protocol: z.enum(["tcp", "udp"]).optional()
}).refine(data => {
    if (["KillProcess", "QuarantineProcess", "DumpProcess"].includes(data.type) && data.pid === undefined) return false;
    if (["BlockIp", "UnblockIp"].includes(data.type) && data.ip === undefined) return false;
    if (["AllowPort", "DenyPort"].includes(data.type) && data.port === undefined) return false;
    return true;
});

const TelemetryWinRequestSchema = z.object({
    id: IdSchema,
    type: z.enum(["GetStatus", "Shutdown"])
});

const MeshRequestSchema = z.object({
    id: IdSchema,
    type: z.enum([
        "GOSSIP_BLOCK", "GOSSIP_THREAT_HASH", "GOSSIP_AUDIT", "GOSSIP_LOCKDOWN",
        "GOSSIP_AUDIT_VERIFY", "MERKLE_CATCH_UP", "FETCH_STATE", "REQUEST_APPROVAL",
        "GET_AUDIT_STATUS", "GET_STATUS"
    ]),
    ip: IpSchema.optional(),
    hash: z.string().optional(),
    events: z.array(AuditEventSchema).optional(),
    sourceNode: z.string().optional(),
    lastKnownHash: z.string().optional(),
    nodeId: z.string().optional(),
    payload: z.object({
        action: z.string(),
        data: z.record(z.string(), z.unknown()).optional(),
        nodeId: z.string(),
        timestamp: z.number()
    }).optional(),
    signature: z.string().optional()
});

const REQUEST_SCHEMAS: Record<SidecarName, z.ZodSchema> = {
    analyzer: AnalyzerRequestSchema,
    enforcer: EnforcerRequestSchema,
    netcap: NetcapRequestSchema,
    decoy: DecoyRequestSchema,
    watchfile: WatchfileRequestSchema,
    sentinel: SentinelRequestSchema,
    trustroot: TrustrootRequestSchema,
    tunnel: TunnelRequestSchema,
    "sentinel-darwin": SentinelDarwinRequestSchema,
    "enforcer-win": EnforcerWinRequestSchema,
    firewall: FirewallRequestSchema,
    "telemetry-win": TelemetryWinRequestSchema,
    mesh: MeshRequestSchema
};

export const SidecarResponseSchema = z.object({
    id: IdSchema,
    success: z.boolean().optional(),
    message: z.string().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    // Agents that serialise `data: None` without skip_serializing_if emit an explicit
    // JSON null. `.optional()` alone rejects that, the response is dropped as a schema
    // violation, and the caller blocks until its IPC timeout.
    data: z.record(z.string(), z.unknown()).nullish(),
    timestamp: z.string().optional(),
    event: z.string().optional(),
    type: z.string().optional(),
    sidecar: z.string().optional(),
    critical: z.boolean().optional(),
    error: z.string().optional()
});

export function validateRequest(sidecar: SidecarName, req: Record<string, any>): boolean {
    const schema = REQUEST_SCHEMAS[sidecar];
    if (!schema) return false;
    return schema.safeParse(req).success;
}

export function validateResponse(_sidecar: SidecarName, res: SidecarResponse): boolean {
    // If it's an event payload, allow it without the success field
    if (res.event) return true;
    return SidecarResponseSchema.safeParse(res).success && typeof res.success === "boolean";
}
