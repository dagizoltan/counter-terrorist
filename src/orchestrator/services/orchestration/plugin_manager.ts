export interface Plugin {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): "ACTIVE" | "INACTIVE" | "ERROR";
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin) {
    this.plugins.set(plugin.name, plugin);
    console.log(`[PLUGINS] Registered plugin: ${plugin.name}`);
  }

  async startAll() {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.start();
        console.log(`[PLUGINS] Started plugin: ${plugin.name}`);
      } catch (e) {
        console.error(`[PLUGINS] Failed to start plugin ${plugin.name}:`, e);
      }
    }
  }

  async stopAll() {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.stop();
      } catch (e) {
        console.error(`[PLUGINS] Error stopping plugin ${plugin.name}:`, e);
      }
    }
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      status: p.status()
    }));
  }
}

export const pluginManager = new PluginManager();
