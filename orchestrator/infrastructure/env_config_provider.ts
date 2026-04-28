import { ConfigurationPort } from "../core/ports.ts";

/**
 * Provides configuration from environment variables.
 */
export class EnvConfigProvider implements ConfigurationPort {
  getToken(): string | undefined {
    return Deno.env.get("API_TOKEN");
  }

  getEnv(key: string): string | undefined {
    return Deno.env.get(key);
  }

  getNumber(key: string, defaultValue: number): number {
    const val = Deno.env.get(key);
    if (val === undefined) return defaultValue;
    const num = Number(val);
    return isNaN(num) ? defaultValue : num;
  }

  getBoolean(key: string, defaultValue: boolean): boolean {
    const val = Deno.env.get(key);
    if (val === undefined) return defaultValue;
    return val.toLowerCase() === "true" || val === "1";
  }
}
