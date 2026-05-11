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
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.start();
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
      }
    }
  }

  async stopAll() {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.stop();
      } catch (e) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:plugin_manager",
            message: `Error stopping plugin ${plugin.name}: ${(e as Error).message}`
        });
      }
    }
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
