import { z } from "npm:zod";

/**
 * Define schemas for all possible system events.
 * This ensures data integrity across the mesh.
 */
export const HoneypotHitSchema = z.object({
  sidecar: z.string(),
  event: z.object({
    type: z.string(),
    src_ip: z.string().optional(),
    dest_port: z.number().optional(),
  }),
});

export const DriftDetectedSchema = z.object({
  resource: z.string(),
  expected: z.any(),
  actual: z.any(),
});

export const ChaosEventSchema = z.object({
  scenario: z.string(),
  action: z.string(),
  target: z.string().optional(),
});

export const SystemEventRegistry = {
  "honeypot": HoneypotHitSchema,
  "drift": DriftDetectedSchema,
  "chaos": ChaosEventSchema,
  "INFO": z.any(),
  "WARN": z.any(),
  "BLOCK": z.any(),
  "CRITICAL": z.any(),
} as const;

export type EventRegistry = typeof SystemEventRegistry;
export type EventName = keyof EventRegistry;

/**
 * Validates an event payload against its registered schema.
 */
export function validateEvent<T extends EventName>(type: T, data: any) {
  const schema = SystemEventRegistry[type];
  if (!schema) return data; // Default to allow if no schema defined yet
  return schema.parse(data);
}
