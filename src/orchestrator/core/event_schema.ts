import { z } from "npm:zod";

/**
 * Define schemas for all possible system events.
 * This ensures data integrity across the mesh.
 */
export const HoneypotHitSchema = z.object({
  sidecar: z.string().optional(),
  event: z.object({
    type: z.string(),
    src_ip: z.string().optional(),
    dest_port: z.number().optional(),
  }).optional(),
});

export const DriftDetectedSchema = z.object({
  resource: z.string().optional(),
  expected: z.any().optional(),
  actual: z.any().optional(),
  path: z.string().optional(),
  action: z.string().optional()
});

export const ChaosEventSchema = z.object({
  scenario: z.string(),
  action: z.string(),
  target: z.string().optional(),
});

export const SystemEventRegistry = {
  "decoy": HoneypotHitSchema,
  "drift": DriftDetectedSchema,
  "chaos": ChaosEventSchema,
  "INFO": z.any(),
  "WARN": z.any(),
  "BLOCK": z.any(),
  "CRITICAL": z.any(),
  "THREAT": z.object({
    code: z.string().optional(),
    src_ip: z.string().optional(),
    message: z.string().optional(),
    severity: z.string().optional(),
    path: z.string().optional()
  }),
  "HONEYPOT": z.object({
    type: z.string(),
    source_ip: z.string(),
    port: z.union([z.number(), z.string()]).optional(),
    module: z.string().optional(),
    severity: z.string().optional()
  }),
  "METRIC_UPDATE": z.object({
    domain: z.string(),
    data: z.any()
  }),
  "AUDIT_EVENT": z.any(),
  "UI_BROADCAST": z.object({
    type: z.string(),
    data: z.any()
  }),
  "EBPF_SYSCALL": z.any(),
  "EBPF_CRITICAL": z.any(),
  "EBPF_STRAY_SHELL": z.any(),
  "DRIFT_PROCESS": z.any(),
  "NETWORK_LOG": z.any(),
  "EXFIL_ALERT": z.any(),
  "PACKET": z.any(),
  "ALERT": z.any()
} as const;

/**
 * Structured Threat Codes for Playbook Engine
 * BUG-4.26 FIX: Use structured codes instead of brittle string matching
 */
export enum TacticalThreatCode {
  SSH_BRUTE_FORCE = "SSH_BRUTE_FORCE",
  REVERSE_SHELL = "REVERSE_SHELL",
  EXPLOIT_ATTEMPT = "EXPLOIT_ATTEMPT",
  CRITICAL_HONEYPOT_HIT = "CRITICAL_HONEYPOT_HIT",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"
}

export type EventRegistry = typeof SystemEventRegistry;
export type EventName = keyof EventRegistry;

/**
 * Validates an event payload against its registered schema.
 */
export function validateEvent<T extends EventName>(type: T, data: any) {
  const schema = (SystemEventRegistry as any)[type];
  if (!schema) return data; // Default to allow if no schema defined yet
  return schema.parse(data);
}
