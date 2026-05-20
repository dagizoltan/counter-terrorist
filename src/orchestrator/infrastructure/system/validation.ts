/**
 * Centralized validation logic for security orchestrator.
 */
import { normalize } from "https://deno.land/std@0.224.0/path/mod.ts";
import { BloomFilter } from "../../core/cache.ts";

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
  if (ip === "localhost" || ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "::1" || ip === "[::1]" || ip === "[::]") {
    return true;
  }

  if (ip === "169.254.169.254" || ip.startsWith("169.254.")) {
    return true;
  }

  // H-02: Enhanced SSRF protection for IPv6 and IPv4-mapped addresses
  const lowerIp = ip.toLowerCase();
  if (lowerIp === "::" || lowerIp === "::1" || lowerIp.startsWith("fe8") || lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) {
    return true;
  }

  // Handle IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (lowerIp.startsWith("::ffff:")) {
      const ipv4Part = lowerIp.substring(7);
      return isPrivateIp(ipv4Part);
  }

  const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 0) return true;
  }

  return false;
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
    const ips = await Deno.resolveDns(hostname, "A");
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
 */
export function validatePath(p: string, jailPrefixes?: string[]): boolean {
  if (typeof p !== "string" || p.length === 0) return false;

  // 1. URL Decode to catch encoded bypasses (e.g. %2e%2e, %252e%252e)
  let decoded = p;
  try {
    // BUG-4.22 FIX: Limit decoding iterations to prevent CPU-based DoS
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

  if (jailPrefixes && jailPrefixes.length > 0) {
    const isInside = jailPrefixes.some(jail => {
        const normalizedJail = normalize(jail.endsWith("/") ? jail : jail + "/");
        const normalizedP = normalize(normalized.endsWith("/") ? normalized : normalized + "/");
        return normalizedP.startsWith(normalizedJail);
    });
    if (!isInside) return false;
  }

  // B-09: Refined boundary check to prevent prefix bypass (e.g. /tmp-malicious)
  // Even if no jail is provided, we should ensure the path is safe
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
  success: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
  data?: any;
  timestamp?: string;
  [key: string]: any;
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
  data: any;
  timestamp: string;
  [key: string]: any;
}

// Validation functions

let comparisonKeyPromise: Promise<CryptoKey> | null = null;

/**
 * Gets or generates the HMAC key for constant-time comparisons.
 * Uses a Promise to avoid race conditions during initialization.
 */
async function getComparisonKey(): Promise<CryptoKey> {
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

export function validateRequest(sidecar: SidecarName, req: any): boolean {
  if (!req.type) return false;

  switch (sidecar) {
    case "analyzer":
      if (!["SCAN", "DIR_SCAN", "RKH_SCAN", "QUIT", "MEM_SCAN", "ScanPath", "Quarantine", "SyncSignatures", "GetStatus"].includes(req.type)) return false;
      if (req.type === "DIR_SCAN" || req.type === "ScanPath" || req.type === "Quarantine") {
        if (req.path) {
          if (!validatePath(req.path, SCANNER_JAIL)) return false;
        }
        if (req.paths) {
          if (!Array.isArray(req.paths)) return false;
          if (!req.paths.every((p: string) => validatePath(p, SCANNER_JAIL))) return false;
        }
      }
      return true;
    case "enforcer":
      if (!["KillProcess", "BlockIp", "UnblockIp", "QuarantineProcess", "DumpProcess", "GetStatus"].includes(req.type)) return false;
      if ((req.type === "KillProcess" || req.type === "QuarantineProcess" || req.type === "DumpProcess") && typeof req.pid !== "number") return false;
      const targetIp = req.ip;
      if ((req.type === "BlockIp" || req.type === "UnblockIp") && !isValidIP(targetIp || "")) return false;
      if (req.type === "BlockIp" && isCriticalInfrastructure(targetIp || "")) return false;
      if (req.type === "DumpProcess" && req.path && !validatePath(req.path)) return false;
      return true;
    case "netcap":
      if (!["StartCapture", "StopCapture", "GetStatus"].includes(req.type)) return false;
      if (req.type === "StartCapture") {
        if (req.interface && typeof req.interface !== "string") return false;
        if (req.interface && !INTERFACE_NAME_REGEX.test(req.interface)) return false;
        if (req.duration && typeof req.duration !== "number") return false;
        if (req.duration && req.duration > 3600) return false;
        if (req.filename && typeof req.filename !== "string") return false;
        if (req.filename) {
          const basename = req.filename.split("/").pop()?.split("\\").pop() || "";
          if (!SAFE_FILENAME_REGEX.test(basename)) return false;
        }
      }
      return true;
    case "decoy":
      if (!["ToggleModule", "UpdateModule", "Sabotage", "GetStatus"].includes(req.type)) return false;
      if (req.type === "ToggleModule" || req.type === "UpdateModule") {
        if (typeof req.module !== "string") return false;
        if (typeof req.port !== "number" && typeof req.newPort !== "number") return false;
      }
      if (req.type === "Sabotage" && typeof req.source_ip !== "string") return false;
      return true;
    case "watchfile":
      if (!["WatchPath", "UnwatchPath", "GetStatus"].includes(req.type)) return false;
      const targetPath = req.path;
      if ((req.type === "WatchPath" || req.type === "UnwatchPath") && typeof targetPath !== "string") return false;
      return true;
    case "sentinel":
      const ebpfTypes = [
        "BLOCK_IP", "UNBLOCK_IP", "SHADOW_BAN", "HIDE_PID", "GET_STATUS", 
        "ALLOW_PORT", "DENY_PORT", "FLUSH_RULES", "LOCKDOWN", "SHUTDOWN", "TRUST_COMM",
        "ENFORCE_PID", "UNENFORCE_PID", "KillProcess", "QuarantineProcess", "DumpProcess"
      ];
      if (!ebpfTypes.includes(req.type)) return false;
      if ((req.type === "BLOCK_IP" || req.type === "UNBLOCK_IP" || req.type === "SHADOW_BAN") && !isValidIP(req.ip || "")) return false;
      if (req.type === "BLOCK_IP" && isCriticalInfrastructure(req.ip || "")) return false;
      if (req.type === "TRUST_COMM" && typeof req.comm !== "string") return false;
      if ((req.type === "HIDE_PID" || req.type === "ENFORCE_PID" || req.type === "UNENFORCE_PID" || req.type === "KillProcess" || req.type === "QuarantineProcess" || req.type === "DumpProcess") && typeof req.pid !== "number") return false;
      if ((req.type === "ALLOW_PORT" || req.type === "DENY_PORT") && typeof req.port !== "number") return false;
      if (req.type === "DumpProcess" && req.path && !validatePath(req.path)) return false;
      return true;
    case "trustroot":
      if (!["Seal", "Unseal", "Sign", "Verify", "GetPcrs", "NvDefine", "NvWrite", "NvRead", "QuoteIdentity", "GenerateSelfSignedCA", "IssueNodeCert"].includes(req.type)) return false;
      return true;
    case "tunnel":
      if (!["CONNECT", "DISCONNECT", "GET_STATUS"].includes(req.type)) return false;
      return true;
    case "sentinel-darwin":
      const esfTypes = [
        "BlockIp", "UnblockIp", "ShadowBanIp", "AllowPort", "DenyPort",
        "Lockdown", "FlushRules", "GetStatus", "UpdatePolicy"
      ];
      if (!esfTypes.includes(req.type)) return false;
      if ((req.type === "BlockIp" || req.type === "UnblockIp" || req.type === "ShadowBanIp") && !isValidIP(req.ip || "")) return false;
      if (req.type === "BlockIp" && isCriticalInfrastructure(req.ip || "")) return false;
      if ((req.type === "AllowPort" || req.type === "DenyPort") && typeof req.port !== "number") return false;
      return true;
    case "enforcer-win":
      const wfpTypes = [
        "AddBlockRule", "RemoveBlockRule", "AddAllowRule", "RemoveAllowRule",
        "ProtectDirectory", "GetStatus", "FlushRules"
      ];
      if (!wfpTypes.includes(req.type)) return false;
      if ((req.type === "AddBlockRule" || req.type === "RemoveBlockRule") && !isValidIP(req.ip || "")) return false;
      if (req.type === "AddBlockRule" && isCriticalInfrastructure(req.ip || "")) return false;
      if ((req.type === "AddAllowRule" || req.type === "RemoveAllowRule") && typeof req.port !== "number") return false;
      return true;
    default:
      return false; // Unknown sidecars are rejected by default
  }
}

export function validateResponse(sidecar: SidecarName, res: any): boolean {
  // If it's an event payload, allow it without the success field
  if (res.event) return true;

  if (typeof res.success !== "boolean") return false;

  // Additional sidecar-specific response validation can be added here
  return true;
}
