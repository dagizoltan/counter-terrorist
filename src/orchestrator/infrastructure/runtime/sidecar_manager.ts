import { isAllowedSidecar, SidecarResponse, validateRequest, validateResponse, SidecarName } from "../system/validation.ts";
import { SystemExecutor } from "../system/system_executor.ts";
import { CommandResult, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { SIDECAR_REGISTRY, PERSISTENT_SIDECARS, PRIVILEGED_SIDECARS } from "./sidecar_registry.ts";

import { CommandPort } from "@core/ports.ts";

/**
 * Manages persistent Rust sidecars.
 */
export class SidecarManager implements CommandPort {
  private persistentProcesses: Map<string, Deno.ChildProcess> = new Map();
  private restartCounts: Map<string, { count: number, lastRestart: number }> = new Map();
  private responseWaiters: Map<string, Map<string, { resolve: (data: CommandResult) => void, reject: (err: Error) => void }>> = new Map();
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private unsupportedSidecars: Set<string> = new Set();
  private cleanupRegistered: boolean = false;
  private isShuttingDown: boolean = false;
  private defaultInterface: string | null = null;

  constructor(private executor: SystemExecutor, private logging: LoggingPort) {
    this.registerCleanup();
  }

  getExecutor(): SystemExecutor {
    return this.executor;
  }

  private registerCleanup() {
    if (this.cleanupRegistered) return;
    
    const cleanup = async () => {
      this.isShuttingDown = true;
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.ACTIVITY,
          severity: LogSeverity.INFO,
          caller: "SIDECAR_MANAGER",
          message: "Orchestrator exiting, cleaning up sidecars..."
      });
      for (const name of Array.from(this.persistentProcesses.keys())) {
        await this.stopSidecar(name);
      }
      // Deno.exit(0); // Removing explicit exit as it might interfere with Deno's own cleanup
    };

    Deno.addSignalListener("SIGINT", cleanup);
    Deno.addSignalListener("SIGTERM", cleanup);
    this.cleanupRegistered = true;
  }

  async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    if (!isAllowedSidecar(name)) {
      return { success: false, stdout: "", stderr: `Sidecar '${name}' is not in the allowlist.` };
    }

    if (PERSISTENT_SIDECARS.includes(name)) {
      return { success: false, stdout: "", stderr: `Sidecar '${name}' is a persistent daemon. Use getPersistentSidecar() instead.` };
    }

    const binPath = await this.findBinary(name);
    if (!binPath) {
      return { success: false, stdout: "", stderr: `Sidecar binary '${name}' not found.` };
    }

    // Security: Validate JSON payload if present
    if (args.length > 0) {
      try {
        const payload = JSON.parse(args[0]);
        if (!validateRequest(name as SidecarName, payload)) {
          return { success: false, stdout: "", stderr: `Security violation: Invalid payload for sidecar '${name}'` };
        }
      } catch {
        // Not JSON, continue
      }
    }

    return this.executor.execute(binPath, args);
  }

  private spawningPromises: Map<string, Promise<Deno.ChildProcess | null>> = new Map();

  async getPersistentSidecar(name: string): Promise<Deno.ChildProcess | null> {
    if (!isAllowedSidecar(name)) throw new Error(`Sidecar '${name}' is not in the allowlist.`);
    if (this.unsupportedSidecars.has(name)) return null;
    
    // If already running, return it
    if (this.persistentProcesses.has(name)) return this.persistentProcesses.get(name)!;

    // If currently spawning, wait for the existing promise
    if (this.spawningPromises.has(name)) {
        return await this.spawningPromises.get(name)!;
    }

    // Initiate spawn with a lock
    const spawnPromise = (async () => {
        try {
            const binPath = await this.findBinary(name);
            if (!binPath) {
                this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_NOT_FOUND", sidecar: name });
                return null;
            }

            const env = await this.getSidecarEnv(name);
            const command = new Deno.Command(binPath, {
                args: [],
                stdin: "piped",
                stdout: "piped",
                stderr: "piped",
                env
            });

            const child = command.spawn();
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "SIDECAR_MANAGER",
                message: `Spawned persistent sidecar: ${name}`
            });

            child.status.then((status) => {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: status.code === 0 ? LogSeverity.INFO : LogSeverity.WARNING,
                    caller: "SIDECAR_MANAGER",
                    message: `Sidecar ${name} exited with code ${status.code}`
                });
                this.persistentProcesses.delete(name);
                this.handleSidecarExit(name, status.code);
            });

            // Handle stderr for error detection
            (async () => {
                const reader = child.stderr.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) {
                            const msg = new TextDecoder().decode(value);
                            this.logging.log({
                                timestamp: new Date().toISOString(),
                                type: LogType.GENERIC,
                                severity: LogSeverity.ERROR,
                                caller: `SIDECAR:${name}`,
                                message: msg.trim()
                            });
                            if (msg.includes("UNSUPPORTED_OS")) {
                                this.unsupportedSidecars.add(name);
                                this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_UNSUPPORTED", sidecar: name });
                            }
                            if (msg.includes("PANIC") || msg.includes("error:")) {
                                this.emitEvent("SIDECAR_ALERT", { type: "CRITICAL", sidecar: name, message: msg.trim() });
                            }
                        }
                    }
                } catch (e) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.WARNING,
                        caller: "SIDECAR_MANAGER",
                        message: `[${name}] Stderr reader error: ${(e as Error).message}`
                    });
                } finally {
                    reader.releaseLock();
                }
            })();

            this.persistentProcesses.set(name, child);
            this.startResponseReader(name, child);
            return child;
        } catch (e) {
            this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_SPAWN_FAILED", sidecar: name, error: (e as Error).message });
            return null;
        } finally {
            this.spawningPromises.delete(name);
        }
    })();

    this.spawningPromises.set(name, spawnPromise);
    return await spawnPromise;
  }

  private async findBinary(name: string): Promise<string | null> {
    const isWindows = Deno.build.os === "windows";
    const extension = isWindows ? ".exe" : "";
    
    // Support environment variable overrides for custom binary locations
    const envPath = Deno.env.get(`CTS_BINARY_${name.toUpperCase()}`);
    
    const paths = [
      envPath,
      `./agents/${name}${extension}`,
      `./src/agents/target/release/${name}${extension}`,
      `./src/agents/target/debug/${name}${extension}`,
      `/usr/local/bin/cts-${name}${extension}`,
      `/opt/cts/bin/${name}${extension}`,
    ].filter(Boolean) as string[];

    let agentsDir: string;
    try {
      const localAgents = await Deno.stat("./agents").catch(() => null);
      if (localAgents?.isDirectory) {
        agentsDir = await Deno.realPath("./agents");
      } else {
        agentsDir = await Deno.realPath("./src/agents");
      }
      if (!agentsDir.endsWith("/")) agentsDir += "/";
    } catch {
      agentsDir = "";
    }

    for (const p of paths) {
      if (!p) continue;
      try {
        const info = await Deno.stat(p);
        if (!info.isFile) continue;
        return await Deno.realPath(p);
      } catch {
        continue;
      }
    }
    return null;
  }

  isRunning(name: string): boolean {
    return this.persistentProcesses.has(name) && !this.unsupportedSidecars.has(name);
  }

  private async startResponseReader(name: string, child: Deno.ChildProcess) {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line) as SidecarResponse;

            if (!validateResponse(name as SidecarName, data)) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.ERROR,
                  caller: "SIDECAR_MANAGER",
                  message: `[${name}] Security violation: Invalid response schema.`
              });
              continue;
            }

            if (data.id && this.responseWaiters.has(name)) {
              const waiters = this.responseWaiters.get(name)!;
              const waiter = waiters.get(data.id);
              if (waiter) {
                waiter.resolve({ success: !!data.success, stdout: data.stdout || "", stderr: data.stderr || "", data: data.data });
                waiters.delete(data.id);
                continue;
              }
            }

            const handlers = this.eventHandlers.get(name) || [];
            for (const handler of handlers) {
              handler(data);
            }
          } catch {
            // Not JSON or parse failed
          }
        }
      }
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "SIDECAR_MANAGER",
          message: `[${name}] Response reader error: ${(e as Error).message}`
      });
    } finally {
      reader.releaseLock();
      this.persistentProcesses.delete(name);
    }
  }

  private async getSidecarEnv(name: string): Promise<Record<string, string>> {
    const env: Record<string, string> = {
        "CTS_SIDECAR_NAME": name,
        "RUST_LOG": "info"
    };

    if (name === "ebpf" || name === "pcap") {
        if (!this.defaultInterface) {
            const { getDefaultInterface } = await import("../system/network.ts");
            this.defaultInterface = await getDefaultInterface();
        }
        env["CTS_IFACE"] = this.defaultInterface;
    }

    if (name === "pcap") {
        env["CTS_CAPTURE_DIR"] = "./volume/storage/captures";
    }

    return env;
  }

  async sendCommand(name: string, cmd: string | object): Promise<CommandResult> {
    const child = await this.getPersistentSidecar(name);
    if (!child) throw new Error(`Sidecar ${name} not found`);

    const id = crypto.randomUUID();
    let commandObj: any = typeof cmd === "string" ? { id, type: cmd } : { ...cmd, id };

    if (!validateRequest(name as SidecarName, commandObj)) {
      throw new Error(`Security violation: Invalid command for sidecar '${name}'`);
    }

    const responsePromise = new Promise<CommandResult>((resolve, reject) => {
      if (!this.responseWaiters.has(name)) this.responseWaiters.set(name, new Map());
      this.responseWaiters.get(name)!.set(id, { resolve, reject });
    });

    const timeoutPromise = new Promise<CommandResult>((resolve) => {
      setTimeout(() => {
        if (this.responseWaiters.has(name)) this.responseWaiters.get(name)!.delete(id);
        resolve({ 
          success: false, 
          stdout: "", 
          stderr: `Command ${commandObj.type} to ${name} timed out after 60s` 
        });
      }, 60000);
    });

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(commandObj) + "\n"));
    writer.releaseLock();

    return Promise.race([responsePromise, timeoutPromise]);
  }

  onEvent(name: string, handler: (data: any) => void) {
    if (!this.eventHandlers.has(name)) this.eventHandlers.set(name, []);
    this.eventHandlers.get(name)!.push(handler);
  }

  emitEvent(name: string, data: any) {
    const handlers = this.eventHandlers.get(name);
    if (handlers) {
      for (const handler of handlers) handler(data);
    }
  }

  async restartSidecar(name: string): Promise<void> {
    await this.stopSidecar(name);
    await this.getPersistentSidecar(name);
  }

  async stopSidecar(name: string): Promise<void> {
    const process = this.persistentProcesses.get(name);
    if (process) {
      try {
        process.kill("SIGTERM");
        
        // Wait for exit with 2s timeout
        const timeout = setTimeout(() => {
          try { process.kill("SIGKILL"); } catch { /* ignore */ }
        }, 2000);
        
        await process.status;
        clearTimeout(timeout);
      } catch {
        try {
           process.kill("SIGKILL");
        } catch {
           // Process already dead
        }
      }
      this.persistentProcesses.delete(name);
    }
  }

  async shutdown(): Promise<void> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.ACTIVITY,
        severity: LogSeverity.INFO,
        caller: "SIDECAR_MANAGER",
        message: "Shutting down agent fleet..."
    });
    const names = Array.from(this.persistentProcesses.keys());
    for (const name of names) {
      await this.stopSidecar(name);
    }
  }

  getPID(name: string): number | null {
    const process = this.persistentProcesses.get(name);
    return process ? process.pid : null;
  }

  private handleSidecarExit(name: string, exitCode: number) {
    if (exitCode === 0) return;
    if (this.unsupportedSidecars.has(name)) return;

    const now = Date.now();
    const restartInfo = this.restartCounts.get(name) || { count: 0, lastRestart: 0 };

    if (now - restartInfo.lastRestart > 300000) restartInfo.count = 0;

    if (restartInfo.count < 3 && !this.isShuttingDown) {
      restartInfo.count++;
      restartInfo.lastRestart = now;
      this.restartCounts.set(name, restartInfo);
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "SIDECAR_MANAGER",
          message: `Restarting sidecar ${name} (attempt ${restartInfo.count}/3)`
      });
      setTimeout(() => {
        this.getPersistentSidecar(name).catch(() => {});
      }, Math.pow(2, restartInfo.count - 1) * 1000);
    } else {
      const msg = `Sidecar ${name} failed too many times. Giving up.`;
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "SIDECAR_MANAGER",
          message: msg
      });
      this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_CRASH_LOOP", sidecar: name, message: msg });
    }
  }
}
