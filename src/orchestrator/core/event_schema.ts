import { z } from "zod";

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
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  path: z.string().optional(),
  action: z.string().optional()
});

export const ChaosEventSchema = z.object({
  scenario: z.string(),
  action: z.string(),
  target: z.string().optional(),
});

export const SyscallEventSchema = z.object({
  pid: z.number(),
  ppid: z.number().optional(),
  comm: z.string(),
  syscall: z.string(),
  args: z.array(z.string()).optional(),
  returnValue: z.number().optional(),
  timestamp: z.string().optional(),
  anomalyScore: z.number().optional(),
  intent: z.string().optional()
});

export const NetworkLogSchema = z.object({
  source: z.string(),
  destination: z.string(),
  protocol: z.string(),
  length: z.number(),
  action: z.enum(["ALLOW", "BLOCK", "REJECT", "SHADOW_BAN"]),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  timestamp: z.string().optional(),
  interface: z.string().optional()
});

export const FileDriftSchema = z.object({
  path: z.string(),
  action: z.string(),
  comm: z.string().optional(),
  pid: z.number().optional(),
  hash: z.string().optional(),
  isCanary: z.boolean().optional()
});

export const GenericEventSchema = z.object({
  message: z.string().optional(),
  data: z.unknown().optional(),
  correlationId: z.string().optional(),
  fromAudit: z.boolean().optional()
});

export const SystemEventRegistry = {
  "decoy": HoneypotHitSchema,
  "drift": DriftDetectedSchema,
  "chaos": ChaosEventSchema,
  "INFO": GenericEventSchema,
  "WARN": GenericEventSchema,
  "BLOCK": GenericEventSchema,
  "CRITICAL": GenericEventSchema,
  "THREAT": z.object({
    code: z.string().optional(),
    src_ip: z.string().optional(),
    message: z.string().optional(),
    severity: z.string().optional(),
    path: z.string().optional(),
    nodeId: z.string().optional(),
    correlationId: z.string().optional()
  }),
  "HONEYPOT": z.object({
    type: z.string(),
    source_ip: z.string(),
    port: z.union([z.number(), z.string()]).optional(),
    module: z.string().optional(),
    severity: z.string().optional(),
    correlationId: z.string().optional()
  }),
  "METRIC_UPDATE": z.object({
    domain: z.string(),
    data: z.unknown()
  }),
  "AUDIT_EVENT": z.unknown(),
  "UI_BROADCAST": z.object({
    type: z.string(),
    data: z.unknown()
  }),
  "EBPF_SYSCALL": SyscallEventSchema,
  "EBPF_CRITICAL": SyscallEventSchema,
  "EBPF_STRAY_SHELL": SyscallEventSchema,
  "DRIFT_PROCESS": FileDriftSchema,
  "NETWORK_LOG": NetworkLogSchema,
  "EXFIL_ALERT": z.object({
    pid: z.number().optional(),
    source: z.string().optional(),
    message: z.string().optional(),
    bytes_count: z.number().optional(),
    correlationId: z.string().optional()
  }),
  "PACKET": z.unknown(),
  "ALERT": GenericEventSchema,
  "ARTIFACT_FOUND": z.object({
    indicator: z.string().optional(),
    path: z.string().optional(),
    severity: z.string().optional(),
    correlationId: z.string().optional()
  }),
  "ES_EXEC": z.object({
    path: z.string().optional(),
    pid: z.number().optional(),
    signing_id: z.string().optional(),
    command_line: z.string().optional(),
    correlationId: z.string().optional()
  }),
  "ETW_PROCESS": z.object({
    process_name: z.string().optional(),
    command_line: z.string().optional(),
    pid: z.number().optional(),
    correlationId: z.string().optional()
  }),
  "EBPF_SYSCALL_BATCH": z.array(SyscallEventSchema),
  "NETWORK_LOG_BATCH": z.array(NetworkLogSchema),
  "LEDGER_TAMPER": z.object({
    eventId: z.string().optional(),
    expected: z.string().optional(),
    actual: z.string().optional(),
    type: z.string().optional(),
    reason: z.string().optional()
  })
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
export function validateEvent<T extends EventName>(type: T, data: unknown) {
  const schema = (SystemEventRegistry as Record<string, z.ZodTypeAny>)[type];
  if (!schema) return data; // Default to allow if no schema defined yet
  return schema.parse(data);
}
