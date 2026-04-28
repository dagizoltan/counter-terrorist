import { ConfigurationPort } from "../core/ports.ts";

export class ConfigurationAdapter implements ConfigurationPort {
  getToken(): string | undefined {
    return Deno.env.get("API_TOKEN");
  }

  getEnv(key: string): string | undefined {
    return Deno.env.get(key);
  }
}

export const configurationAdapter = new ConfigurationAdapter();
