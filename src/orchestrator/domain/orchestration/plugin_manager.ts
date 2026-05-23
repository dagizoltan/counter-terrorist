import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export interface Plugin {
  name: string;
  description: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): "ACTIVE" | "INACTIVE" | "ERROR";
}

import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

export class PluginManager extends BaseService {
  private plugins: Map<string, Plugin> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor() {
    super();
  }

  protected override async onInit(): Promise<Result<void>> {
    await this.startAll();
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    await this.stopAll();
    return ok(undefined);
  }

  /**
   * Securely loads a plugin into a restricted Deno.Worker sandbox.
   */
  async loadPlugin(name: string, scriptUrl: string) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "orchestrator:domain:orchestration:plugin_manager",
          message: `Shielding community plugin in secure worker: ${name}`
      });

      // Establish restricted permissions for the sandbox
      const worker = new Worker(scriptUrl, {
          type: "module",
          name,
          deno: {
              permissions: {
                  net: false,
                  read: false,
                  write: false,
                  run: false,
                  env: false,
                  sys: false,
              }
          }
      } as any);

      this.workers.set(name, worker);

      worker.onmessage = (e) => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.ACTIVITY,
              severity: LogSeverity.INFO,
              caller: `plugin:${name}`,
              message: `IPC Message: ${JSON.stringify(e.data)}`
          });
      };

      worker.onerror = (e) => {
          loggingService.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: `plugin:${name}`,
              message: `Worker Exception: ${e.message}`
          });
      };
  }

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

  async startAll(): Promise<{ name: string; success: boolean; error?: string }[]> {
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
        return { name: plugin.name, success: true };
      } catch (e) {
        const error = (e as Error).message;
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:orchestration:plugin_manager",
            message: `Failed to start plugin ${plugin.name}: ${error}`
        });
        // BUG-11.3: Start failure is implicitly reflected by the plugin's own status()
        // since we didn't await successfully.
        return { name: plugin.name, success: false, error };
      }
    });

    return await Promise.all(startPromises);
  }

  async stopAll() {
    // Terminate all sandboxed workers
    for (const [name, worker] of this.workers.entries()) {
        try {
            worker.terminate();
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:plugin_manager",
                message: `Terminated sandboxed plugin: ${name}`
            });
        } catch (e) { /* ignore */ }
    }
    this.workers.clear();

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
