import { isAllowedSidecar, SidecarResponse, validateRequest, validateResponse, SidecarName } from "../system/validation.ts";
import { SystemExecutor } from "../system/system_executor.ts";
import { CommandResult } from "../system/command_manager.ts";
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

  constructor(private executor: SystemExecutor) {
    this.registerCleanup();
  }

  private registerCleanup() {
    if (this.cleanupRegistered) return;
    
    const cleanup = async () => {
      console.log("[SIDE-MAN] Orchestrator exiting, cleaning up sidecars...");
      for (const name of Array.from(this.persistentProcesses.keys())) {
        await this.stopSidecar(name);
      }
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGINT", cleanup);
    Deno.addSignalListener("SIGTERM", cleanup);
    this.cleanupRegistered = true;
  }

  async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    if (!isAllowedSidecar(name)) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar '${name}' is not in the allowlist.`,
      };
    }

    if (PERSISTENT_SIDECARS.includes(name)) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar '${name}' is a persistent daemon. Use getPersistentSidecar() instead.`,
      };
    }

    const binPath = await this.findBinary(name);
    if (!binPath) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar binary '${name}' not found in agents/target/`,
      };
    }

    // Security: If first arg is JSON, validate it
    if (args.length > 0) {
      try {
        const payload = JSON.parse(args[0]);
        if (!validateRequest(name as SidecarName, payload)) {
          return {
            success: false,
            stdout: "",
            stderr: `Security violation: Invalid payload for sidecar '${name}'`,
          };
        }
      } catch (e) {
        // Not JSON, skip validation for now
        console.debug?.(`[SIDE-MAN:${name}] Payload is not JSON, skipping validation: ${e}`);
      }
    }

    return this.executor.execute(binPath, args);
  }

  async getPersistentSidecar(name: string): Promise<Deno.ChildProcess | null> {
    if (!isAllowedSidecar(name)) {
      throw new Error(`Sidecar '${name}' is not in the allowlist.`);
    }

    if (this.unsupportedSidecars.has(name)) {
      return null;
    }

    if (this.persistentProcesses.has(name)) {
      return this.persistentProcesses.get(name)!;
    }

    const binPath = await this.findBinary(name);
    if (!binPath) return null;

    const isPrivileged = PRIVILEGED_SIDECARS.includes(name);
    const isAlreadyRoot = Deno.uid() === 0;

    const command = new Deno.Command((isPrivileged && !isAlreadyRoot) ? "sudo" : binPath, {
      args: (isPrivileged && !isAlreadyRoot) ? ["-n", binPath] : [],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = command.spawn();
    console.log(`[SIDE-MAN] Spawned persistent sidecar: ${name}`);

    child.status.then((status) => {
      console.warn(`[SIDE-MAN] Sidecar ${name} exited with code ${status.code}.`);
      this.persistentProcesses.delete(name);
      this.handleSidecarExit(name, status.code);
    });

    // Handle stderr
    (async () => {
      const reader = child.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const msg = new TextDecoder().decode(value);
            console.error(`[SIDECAR:${name}] ${msg.trim()}`);
            if (msg.includes("UNSUPPORTED_OS")) {
              this.unsupportedSidecars.add(name);
              console.warn(`[SIDE-MAN] Marked sidecar ${name} as unsupported on this OS.`);
            }
          }
        }
      } catch (e) {
        console.error(`[SIDE-MAN:${name}] Stderr reader error:`, e);
      } finally {
        reader.releaseLock();
      }
    })();

    this.persistentProcesses.set(name, child);
    this.startResponseReader(name, child);
    return child;
  }

  private async findBinary(name: string): Promise<string | null> {
    const isWindows = Deno.build.os === "windows";
    const extension = isWindows ? ".exe" : "";

    // Define search paths in order of preference (release bundle first, then dev)
    const paths = [
      `./agents/${name}${extension}`, // Local release folder
      `./src/agents/target/release/${name}${extension}`, // Dev monorepo release
      `./src/agents/target/debug/${name}${extension}`, // Dev monorepo debug
      `/usr/local/bin/cts-${name}${extension}`, // System install
    ];

    let agentsDir: string;
    try {
      // Prioritize local agents dir in release bundle
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
      try {
        // First check if the file exists before calling realPath (which throws if not found)
        const info = await Deno.stat(p);
        if (!info.isFile) continue;

        const absolutePath = await Deno.realPath(p);

        // Security: If we are looking in ./agents, ensure the binary stays within it
        if (p.startsWith("./src/agents") && agentsDir && !absolutePath.startsWith(agentsDir)) {
          console.error(`[SIDE-MAN] Security violation: Binary ${absolutePath} is outside agents directory`);
          continue;
        }

        return absolutePath;
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

          if (line.includes("UNSUPPORTED_OS")) {
            this.unsupportedSidecars.add(name);
            console.warn(`[SIDE-MAN] Marked sidecar ${name} as unsupported on this OS.`);
            continue;
          }

          try {
            const data = JSON.parse(line) as SidecarResponse;

            if (!validateResponse(name as SidecarName, data)) {
              const msg = `[SIDE-MAN:${name}] Security violation: Invalid response schema from sidecar. Missing 'success' or invalid format. Payload: ${line}`;
              console.error(msg);
              
              // If this was a response to a command, fail the command immediately
              if (data.id && this.responseWaiters.has(name)) {
                const waiters = this.responseWaiters.get(name)!;
                const waiter = waiters.get(data.id);
                if (waiter) {
                  waiter.reject(new Error(msg));
                  waiters.delete(data.id);
                }
              }
              continue;
            }

            if (data.id && this.responseWaiters.has(name)) {
              const waiters = this.responseWaiters.get(name)!;
              const waiter = waiters.get(data.id);
              if (waiter) {
                waiter.resolve({
                    success: !!data.success,
                    stdout: data.stdout || "",
                    stderr: data.stderr || "",
                    data: data.data
                });
                waiters.delete(data.id);
                continue;
              }
            }

            const handlers = this.eventHandlers.get(name) || [];
            for (const handler of handlers) {
              handler(data);
            }
          } catch (e) {
            console.error(`[SIDE-MAN:${name}] Failed to parse response JSON: ${line}. Error: ${(e as Error).message}`);
            // We can't easily notify a waiter here because we don't have the 'id' yet
          }
        }
      }
    } catch (e) {
      console.error(`[SIDE-MAN:${name}] Reader error:`, e);
    } finally {
      reader.releaseLock();
      this.persistentProcesses.delete(name);

      if (this.responseWaiters.has(name)) {
        const waiters = this.responseWaiters.get(name)!;
        for (const [_, waiter] of waiters.entries()) {
          waiter.reject(new Error(`Sidecar ${name} terminated`));
        }
      }
      this.responseWaiters.delete(name);
    }
  }

  async sendCommand(name: string, cmd: string | object): Promise<CommandResult> {
    const child = await this.getPersistentSidecar(name);
    if (!child) throw new Error(`Sidecar ${name} not found`);

    const id = crypto.randomUUID();
    let commandObj: any;
    if (typeof cmd === "string") {
      commandObj = { id, type: cmd };
    } else {
      commandObj = { ...cmd, id };
    }

    if (!validateRequest(name as SidecarName, commandObj)) {
      throw new Error(`Security violation: Invalid command for sidecar '${name}'`);
    }

    const responsePromise = new Promise<CommandResult>((resolve, reject) => {
      if (!this.responseWaiters.has(name)) {
        this.responseWaiters.set(name, new Map());
      }
      this.responseWaiters.get(name)!.set(id, { resolve, reject });
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        if (this.responseWaiters.has(name)) {
          this.responseWaiters.get(name)!.delete(id);
        }
        reject(new Error(`Command ${commandObj.type} to ${name} timed out after 60s`));
      }, 60000);
    });

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(commandObj) + "\n"));
    writer.releaseLock();

    return Promise.race([responsePromise, timeoutPromise]);
  }

  onEvent(name: string, handler: (data: any) => void) {
    if (!this.eventHandlers.has(name)) {
      this.eventHandlers.set(name, []);
    }
    this.eventHandlers.get(name)!.push(handler);
  }

  emitEvent(name: string, data: any) {
    const handlers = this.eventHandlers.get(name);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
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
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[SIDE-MAN] Failed to kill ${name} with SIGTERM, forcing SIGKILL:`, msg);
        process.kill("SIGKILL");
      }
      this.persistentProcesses.delete(name);
    }
  }

  private handleSidecarExit(name: string, exitCode: number) {
    if (exitCode === 0) return; // Clean exit
    if (this.unsupportedSidecars.has(name)) return; // Don't restart unsupported sidecars

    const now = Date.now();
    const restartInfo = this.restartCounts.get(name) || { count: 0, lastRestart: 0 };

    // Reset count if last restart was more than 5 minutes ago
    if (now - restartInfo.lastRestart > 300000) {
      restartInfo.count = 0;
    }

    if (restartInfo.count < 3) {
      restartInfo.count++;
      restartInfo.lastRestart = now;
      this.restartCounts.set(name, restartInfo);

      console.log(`[SIDE-MAN] Restarting sidecar ${name} (attempt ${restartInfo.count}/3)...`);
      const backoffMs = Math.pow(2, restartInfo.count - 1) * 1000;
      setTimeout(() => {
        this.getPersistentSidecar(name).catch(err => {
          console.error(`[SIDE-MAN] Failed to restart sidecar ${name}:`, err.message);
        });
      }, backoffMs);
    } else {
      console.error(`[SIDE-MAN] Sidecar ${name} failed too many times. Giving up.`);
    }
  }
}
