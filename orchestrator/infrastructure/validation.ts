/**
 * Centralized validation logic for security orchestrator.
 */

export const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export function isValidIP(ip: string): boolean {
  return IP_REGEX.test(ip);
}

export const ALLOWED_SIDECARS = ["scanner", "blocker", "honeypot", "pcap", "ebpf"] as const;
export type SidecarName = typeof ALLOWED_SIDECARS[number];

export function isAllowedSidecar(name: string): name is SidecarName {
  return (ALLOWED_SIDECARS as readonly string[]).includes(name);
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
  type: "KillProcess" | "BlockIp" | "UnblockIp";
  payload: {
    pid?: number;
    ip?: string;
  };
}

export interface PcapRequest extends BaseRequest {
  type: "StartCapture" | "StopCapture";
  payload?: {
    interface?: string;
    duration?: number;
    filename?: string;
  };
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

let comparisonKey: CryptoKey | null = null;

/**
 * Constant-time comparison using HMAC to prevent timing attacks.
 * It hashes both inputs with HMAC-SHA256 using a per-process random key,
 * ensuring fixed-length outputs and preventing timing attack vectors.
 */
export async function secureCompare(a: string | undefined, b: string | undefined): Promise<boolean> {
  if (a === undefined || b === undefined) return false;

  const encoder = new TextEncoder();

  if (!comparisonKey) {
    comparisonKey = await crypto.subtle.generateKey(
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }

  const aMac = new Uint8Array(await crypto.subtle.sign("HMAC", comparisonKey, encoder.encode(a)));
  const bMac = new Uint8Array(await crypto.subtle.sign("HMAC", comparisonKey, encoder.encode(b)));

  return secureCompareBytes(aMac, bMac);
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
        if (req.path && typeof req.path !== "string") return false;
        if (req.paths && !Array.isArray(req.paths)) return false;
      }
      return true;
    case "blocker":
      if (!["KillProcess", "BlockIp", "UnblockIp"].includes(req.type)) return false;
      if (req.type === "KillProcess" && typeof req.payload?.pid !== "number") return false;
      if ((req.type === "BlockIp" || req.type === "UnblockIp") && !isValidIP(req.payload?.ip || "")) return false;
      return true;
    case "pcap":
      if (!["StartCapture", "StopCapture"].includes(req.type)) return false;
      if (req.type === "StartCapture") {
        if (req.payload?.interface && typeof req.payload.interface !== "string") return false;
        if (req.payload?.duration && typeof req.payload.duration !== "number") return false;
        if (req.payload?.filename && typeof req.payload.filename !== "string") return false;
      }
      return true;
    default:
      return true; // Other sidecars use loose schemas for now
  }
}

export function validateResponse(sidecar: SidecarName, res: any): boolean {
  if (typeof res.success !== "boolean") return false;

  // Additional sidecar-specific response validation can be added here
  return true;
}
