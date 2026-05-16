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
  ALLOWED_ORIGINS: z.string().default("*"),
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().default(24),
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  ENVIRONMENT: z.enum(["development", "production", "test"]).default("development"),
  REMOTE_SYSLOG_URL: z.string().url().optional(),
  INTEL_ALLOWLIST: z.string().default("1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4,127.0.0.1,0.0.0.0,192.168.,10.,172.16."),
  INTEL_SYNC_INTERVAL_HOURS: z.coerce.number().default(1),
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
    INTEL_ALLOWLIST: Deno.env.get("INTEL_ALLOWLIST"),
    INTEL_SYNC_INTERVAL_HOURS: Deno.env.get("INTEL_SYNC_INTERVAL_HOURS"),
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
