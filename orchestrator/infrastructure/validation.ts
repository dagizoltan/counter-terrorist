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

export interface SidecarResponse {
  id?: string;
  success: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
  data?: any;
  [key: string]: any;
}

export function validateSidecarResponse(data: any): data is SidecarResponse {
  if (typeof data !== "object" || data === null) return false;
  if ("success" in data && typeof data.success !== "boolean") return false;
  if ("id" in data && typeof data.id !== "string") return false;
  return true;
}

export function validateSidecarCommand(cmd: any): boolean {
  if (typeof cmd !== "object" || cmd === null) return false;
  if (!("id" in cmd) || typeof cmd.id !== "string") return false;
  if (!("type" in cmd) || typeof cmd.type !== "string") return false;
  return true;
}

export interface SidecarEvent {
  type: string;
  data: any;
  timestamp: string;
  [key: string]: any;
}
