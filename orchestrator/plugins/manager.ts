export interface HoneypotConfig {
  name: string;
  description: string;
  port: number;
}

export interface HoneypotPlugin {
  config: HoneypotConfig;
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  status(): boolean;
}

export class PluginManager {
  private plugins: Map<string, HoneypotPlugin> = new Map();

  register(plugin: HoneypotPlugin) {
    if (this.plugins.has(plugin.config.name)) {
      throw new Error(`Plugin ${plugin.config.name} is already registered.`);
    }
    this.plugins.set(plugin.config.name, plugin);
  }

  get(name: string): HoneypotPlugin | undefined {
    return this.plugins.get(name);
  }

  list(): HoneypotPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginManager = new PluginManager();
