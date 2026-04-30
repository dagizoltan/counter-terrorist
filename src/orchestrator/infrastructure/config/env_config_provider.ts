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
    // Fallback to direct Deno.env for keys not in the schema, 
    // but preferred to add them to schema.
    return (this.config as any)[key] || Deno.env.get(key);
  }

  getNumber(key: string, defaultValue: number): number {
    const val = (this.config as any)[key];
    if (val === undefined) return defaultValue;
    return typeof val === "number" ? val : defaultValue;
  }

  getBoolean(key: string, defaultValue: boolean): boolean {
    const val = (this.config as any)[key];
    if (val === undefined) return defaultValue;
    return val === true || val === "true";
  }
}
