import { z } from "npm:zod";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";

/**
 * Validated schema for the entire application configuration.
 */
export const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8000),
  API_TOKEN: z.string().min(16, "API_TOKEN must be at least 16 characters for security"),
  MESH_SECRET: z.string().min(16, "MESH_SECRET must be at least 16 characters"),
  // SECURITY: Avoid wildcard '*' in production. Explicitly whitelist tactical dashboard origins.
  // BUG-8.2 FIX: Enforce production safety by defaulting to self if not provided
  ALLOWED_ORIGINS: z.string().default("self"),
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().default(24),
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  ENVIRONMENT: z.enum(["development", "production", "test"]).default("development"),
  REMOTE_SYSLOG_URL: z.string().url().optional(),
  SYSLOG_HOST: z.string().optional(),
  SYSLOG_PORT: z.coerce.number().default(514),
  SYSLOG_TRANSPORT: z.enum(["udp", "tcp", "tls"]).default("udp"),
  SYSLOG_CA_PATH: z.string().optional(),
  INTEL_ALLOWLIST: z.string().default("1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4,127.0.0.1,0.0.0.0,192.168.,10.,172.16."),
  INTEL_SYNC_INTERVAL_HOURS: z.coerce.number().default(1),

  // Tactical Operational Flags
  PILOT_MODE: z.coerce.boolean().default(false),
  SHADOW_MODE: z.coerce.boolean().default(false),
  STRICT_POLICY_ENFORCEMENT: z.coerce.boolean().default(false),
  AUTO_RESTORE_LKG: z.coerce.boolean().default(false),
  SHADOW_MODE_DURATION_HOURS: z.coerce.number().default(24),

  // Service-Specific Tuning
  AUDIT_RETENTION_DAYS: z.coerce.number().default(90),
  AUDIT_MAX_EVENTS: z.coerce.number().default(10000),
  STEALTH_ENABLED: z.coerce.boolean().default(true),

  // Security Overrides
  ALLOW_HARDWARE_BYPASS: z.coerce.boolean().default(false),
  SECURE_ENVIRONMENT_TOKEN: z.string().optional(),
  SECURE_BYPASS_TOKEN: z.string().optional(),

  // Network/Identity
  GATEWAY_IP: z.string().optional(),
  PILOT_CHECKIN_IP: z.string().default("8.8.8.8"),
  MESH_DOMAIN: z.string().default("cts-mesh.internal"),
  PKI_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Loads and validates configuration from environment variables.
 * Fails fast if the environment is invalid.
 */
export function loadConfig(): AppConfig {
  const rawConfig = {
    PORT: Deno.env.get("PORT"),
    API_TOKEN: Deno.env.get("API_TOKEN"),
    MESH_SECRET: Deno.env.get("MESH_SECRET"),
    ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS"),
    TLS_CERT_PATH: Deno.env.get("TLS_CERT_PATH"),
    TLS_KEY_PATH: Deno.env.get("TLS_KEY_PATH"),
    SESSION_TTL_HOURS: Deno.env.get("SESSION_TTL_HOURS"),
    LOG_LEVEL: Deno.env.get("LOG_LEVEL"),
    ENVIRONMENT: Deno.env.get("ENVIRONMENT"),
    REMOTE_SYSLOG_URL: Deno.env.get("REMOTE_SYSLOG_URL"),
    SYSLOG_HOST: Deno.env.get("SYSLOG_HOST"),
    SYSLOG_PORT: Deno.env.get("SYSLOG_PORT"),
    SYSLOG_TRANSPORT: Deno.env.get("SYSLOG_TRANSPORT"),
    SYSLOG_CA_PATH: Deno.env.get("SYSLOG_CA_PATH"),
    INTEL_ALLOWLIST: Deno.env.get("INTEL_ALLOWLIST"),
    INTEL_SYNC_INTERVAL_HOURS: Deno.env.get("INTEL_SYNC_INTERVAL_HOURS"),
    PILOT_MODE: Deno.env.get("PILOT_MODE"),
    SHADOW_MODE: Deno.env.get("SHADOW_MODE"),
    STRICT_POLICY_ENFORCEMENT: Deno.env.get("STRICT_POLICY_ENFORCEMENT"),
    AUTO_RESTORE_LKG: Deno.env.get("AUTO_RESTORE_LKG"),
    SHADOW_MODE_DURATION_HOURS: Deno.env.get("SHADOW_MODE_DURATION_HOURS"),
    AUDIT_RETENTION_DAYS: Deno.env.get("AUDIT_RETENTION_DAYS"),
    AUDIT_MAX_EVENTS: Deno.env.get("AUDIT_MAX_EVENTS"),
    STEALTH_ENABLED: Deno.env.get("STEALTH_ENABLED"),
    ALLOW_HARDWARE_BYPASS: Deno.env.get("ALLOW_HARDWARE_BYPASS"),
    SECURE_ENVIRONMENT_TOKEN: Deno.env.get("SECURE_ENVIRONMENT_TOKEN"),
    SECURE_BYPASS_TOKEN: Deno.env.get("SECURE_BYPASS_TOKEN"),
    GATEWAY_IP: Deno.env.get("GATEWAY_IP"),
    PILOT_CHECKIN_IP: Deno.env.get("PILOT_CHECKIN_IP"),
    MESH_DOMAIN: Deno.env.get("MESH_DOMAIN"),
    PKI_SECRET: Deno.env.get("PKI_SECRET"),
  };

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:core:config",
        message: "INVALID CONFIGURATION DETECTED",
        payload: result.error.format()
    }).catch(() => {});
    throw new Error("Application failed to boot due to configuration errors.");
  }

  return result.data;
}
