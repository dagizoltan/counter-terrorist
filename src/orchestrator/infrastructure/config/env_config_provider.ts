import { ConfigurationPort } from "@core/ports.ts";
import { AppConfig } from "@core/config_schema.ts";

/**
 * Provides configuration from a validated AppConfig object.
 */
export class EnvConfigProvider implements ConfigurationPort {
  constructor(private config: AppConfig) {}

  getToken(): string | undefined {
    return this.config.API_TOKEN;
  }

  getMeshSecret(): string | undefined {
    return this.config.MESH_SECRET;
  }

  getEnv(key: string): string | undefined {
    const val = (this.config as any)[key];
    if (val === undefined) {
      // Fallback to Deno.env for non-schema variables if absolutely necessary
      // but log a warning as this bypasses validation.
      return Deno.env.get(key);
    }
    return val !== undefined ? String(val) : undefined;
  }

  getNumber(key: string, defaultValue: number): number {
    const val = this.config[key as keyof AppConfig];
    if (val === undefined) return defaultValue;
    return typeof val === "number" ? val : Number(val);
  }

  getBoolean(key: string, defaultValue: boolean): boolean {
    const val = this.config[key as keyof AppConfig];
    if (val === undefined) return defaultValue;
    return val === true || (val as unknown) === "true" || val === 1;
  }
}
