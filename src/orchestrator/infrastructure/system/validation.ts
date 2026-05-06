/**
 * Centralized validation logic for security orchestrator.
 */
import { normalize } from "https://deno.land/std@0.224.0/path/mod.ts";

export const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export function isValidIP(ip: string): boolean {
  return IP_REGEX.test(ip);
}

/**
 * Checks if an IP is part of the critical infrastructure that should NEVER be blocked.
 */
export function isCriticalInfrastructure(ip: string): boolean {
  const whitelist = [
    "1.1.1.1", "8.8.8.8", "8.8.4.4", // DNS
    "127.0.0.1", "::1",              // Loopback
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

  // Block loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return { valid: false, reason: "Loopback addresses are not allowed" };
  }

  // Block cloud metadata endpoints
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return { valid: false, reason: "Cloud metadata endpoints are not allowed" };
  }

  // Block link-local range (169.254.x.x)
  if (hostname.startsWith("169.254.")) {
    return { valid: false, reason: "Link-local addresses are not allowed" };
  }

  // Block RFC1918 private ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return { valid: false, reason: "RFC1918 private addresses (10.x.x.x) are not allowed" };
    if (a === 172 && b >= 16 && b <= 31) return { valid: false, reason: "RFC1918 private addresses (172.16-31.x.x) are not allowed" };
    if (a === 192 && b === 168) return { valid: false, reason: "RFC1918 private addresses (192.168.x.x) are not allowed" };
    if (a === 100 && b >= 64 && b <= 127) return { valid: false, reason: "Carrier-grade NAT (100.64.0.0/10) addresses are not allowed" };
    if (a === 198 && (b === 18 || b === 19)) return { valid: false, reason: "Benchmark testing (198.18.0.0/15) addresses are not allowed" };
    if (a === 0) return { valid: false, reason: "Zero-prefix addresses are not allowed" };
  }

  return { valid: true };
}

export const ALLOWED_SIDECARS = ["scanner", "blocker", "honeypot", "pcap", "ebpf", "fim", "tpm", "vpn", "mesh", "firewall"] as const;
export type SidecarName = typeof ALLOWED_SIDECARS[number];

export function isAllowedSidecar(name: string): name is SidecarName {
  return (ALLOWED_SIDECARS as readonly string[]).includes(name);
}

/**
 * Validates a filesystem path to prevent traversal and prefix bypass.
 */
export function validatePath(p: string): boolean {
  if (typeof p !== "string" || p.length === 0) return false;

  // Reject obvious traversal and prefix bypasses (e.g. //etc/passwd)
  if (p.includes("..") || p.startsWith("//") || p.startsWith("\\\\")) return false;

  try {
    const n = normalize(p);
    if (n.includes("..")) return false;
  } catch {
    return false;
  }

  return true;
}

// IPC Schemas

export interface BaseRequest {
  id?: string;
  type: string;
}

export interface ScannerRequest extends BaseRequest {
  type: "SCAN" | "DIR_SCAN" | "RKH_SCAN" | "QUIT";
  path?: string;
  paths?: string[];
}

export interface BlockerRequest extends BaseRequest {
  type: "KillProcess" | "BlockIp" | "UnblockIp" | "QuarantineProcess" | "DumpProcess";
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

export function validateRequest(sidecar: SidecarName, req: any): boolean {
  if (!req.type) return false;

  switch (sidecar) {
    case "scanner":
      if (!["SCAN", "DIR_SCAN", "RKH_SCAN", "QUIT"].includes(req.type)) return false;
      if (req.type === "DIR_SCAN") {
        if (req.path) {
          if (!validatePath(req.path)) return false;
        }
        if (req.paths) {
          if (!Array.isArray(req.paths)) return false;
          if (!req.paths.every((p: string) => validatePath(p))) return false;
        }
      }
      return true;
    case "blocker":
      if (!["KillProcess", "BlockIp", "UnblockIp", "QuarantineProcess", "DumpProcess"].includes(req.type)) return false;
      if (req.type === "KillProcess" && typeof req.pid !== "number") return false;
      const targetIp = req.ip;
      if ((req.type === "BlockIp" || req.type === "UnblockIp") && !isValidIP(targetIp || "")) return false;
      if (req.type === "BlockIp" && isCriticalInfrastructure(targetIp || "")) return false;
      return true;
    case "pcap":
      if (!["StartCapture", "StopCapture"].includes(req.type)) return false;
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
    case "honeypot":
      if (!["ToggleModule", "UpdateModule", "Sabotage", "GetStatus"].includes(req.type)) return false;
      if (req.type === "ToggleModule" || req.type === "UpdateModule") {
        if (typeof req.module !== "string") return false;
        if (typeof req.port !== "number" && typeof req.newPort !== "number") return false;
      }
      if (req.type === "Sabotage" && typeof req.source_ip !== "string") return false;
      return true;
    case "fim":
      if (!["WatchPath", "UnwatchPath", "GetStatus"].includes(req.type)) return false;
      const targetPath = req.path;
      if ((req.type === "WatchPath" || req.type === "UnwatchPath") && typeof targetPath !== "string") return false;
      return true;
    case "ebpf":
      const ebpfTypes = [
        "BLOCK_IP", "UNBLOCK_IP", "SHADOW_BAN", "HIDE_PID", "GET_STATUS", 
        "ALLOW_PORT", "DENY_PORT", "FLUSH_RULES", "LOCKDOWN", "SHUTDOWN"
      ];
      if (!ebpfTypes.includes(req.type)) return false;
      if ((req.type === "BLOCK_IP" || req.type === "UNBLOCK_IP" || req.type === "SHADOW_BAN") && !isValidIP(req.ip || "")) return false;
      if (req.type === "BLOCK_IP" && isCriticalInfrastructure(req.ip || "")) return false;
      return true;
    case "tpm":
      if (!["Seal", "Unseal", "Sign", "Verify", "GetPcrs"].includes(req.type)) return false;
      return true;
    case "vpn":
      if (!["Connect", "Disconnect", "GetStatus"].includes(req.type)) return false;
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
