import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export interface Plugin {
  name: string;
  description: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): "ACTIVE" | "INACTIVE" | "ERROR";
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin) {
    this.plugins.set(plugin.name, plugin);
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:orchestration:plugin_manager",
        message: `Registered plugin: ${plugin.name}`
    });
  }

  async startAll() {
    // BUG-6.5 FIX: Start plugins in parallel with timeouts to avoid boot blocking
    const startPromises = Array.from(this.plugins.values()).map(async (plugin) => {
      try {
        await Promise.race([
            plugin.start(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Plugin start timeout")), 15000))
        ]);
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:plugin_manager",
            message: `Started plugin: ${plugin.name}`
        });
      } catch (e) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:plugin_manager",
            message: `Failed to start plugin ${plugin.name}: ${(e as Error).message}`
        });
        // BUG-11.3: Start failure is implicitly reflected by the plugin's own status()
        // since we didn't await successfully.
      }
    });

    await Promise.all(startPromises);
  }

  async stopAll() {
    // BUG-6.5 FIX: Stop plugins in parallel with timeouts
    const stopPromises = Array.from(this.plugins.values()).map(async (plugin) => {
      try {
        await Promise.race([
            plugin.stop(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Plugin stop timeout")), 5000))
        ]);
      } catch (e) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:plugin_manager",
            message: `Error stopping plugin ${plugin.name}: ${(e as Error).message}`
        });
      }
    });

    await Promise.all(stopPromises);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      status: p.status(),
      description: p.description
    }));
  }
}

export const pluginManager = new PluginManager();
