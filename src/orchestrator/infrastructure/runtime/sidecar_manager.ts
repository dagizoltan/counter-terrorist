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
  private rotationInterval?: number;
  private backoffTimers: Set<number> = new Set();

  private manifest: any = null;
  private manifestPromise: Promise<void> | null = null;

  constructor(private executor: SystemExecutor, private logging: LoggingPort) {
    this.registerCleanup();
    this.startRotationLoop();
    // Manifest load is async and uses logging, so we don't block constructor
    // but ensure it's called after logging service is ready.
    this.manifestPromise = new Promise(resolve => {
        setTimeout(async () => {
            await this.loadManifest();
            resolve();
        }, 0);
    });
  }

  private async loadManifest() {
    try {
        const manifestUrl = new URL("./sidecars.manifest.json", import.meta.url);
        const content = await Deno.readTextFile(manifestUrl);
        this.manifest = JSON.parse(content);
        if (this.logging) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "orchestrator:infra:runtime:sidecar_manager",
                message: `Authoritative Manifest Loaded. Signed by: ${this.manifest.signedBy}`
            });
        }
    } catch (e) {
        if (this.logging) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:infra:runtime:sidecar_manager",
                message: `Manifest unavailable. Falling back to environment-based integrity: ${(e as Error).message}`
            });
        }
    }
  }

  /**
   * Periodically rotates all active sidecars to neutralize memory-resident exploits.
   */
  private startRotationLoop() {
    const ROTATION_INTERVAL = 6 * 60 * 60 * 1000; // 6 Hours
    this.rotationInterval = setInterval(async () => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: "CYCLIC ROTATION TRIGGERED: Re-verifying and refreshing all agent binaries..."
        });

        for (const name of Array.from(this.persistentProcesses.keys())) {
            await this.rotateSidecar(name);
        }
    }, ROTATION_INTERVAL);
  }

  private async rotateSidecar(name: string) {
    const config = SIDECAR_REGISTRY[name];
    const binPath = `./bin/agents/${config.binaryName || name}`;
    
    // 1. Forced re-healing from Golden Repository
    const healed = await this.verifyAndHeal(name, binPath, true); 
    
    if (healed) {
        // 2. Graceful restart
        await this.stopSidecar(name);
        await this.getPersistentSidecar(name);
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.SUCCESS,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `Agent ${name} rotated and re-spawned from Golden Baseline.`
        });
    }
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
          caller: "orchestrator:infra:runtime:sidecar_manager",
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
    await this.manifestPromise;
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
            this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.INFO, caller: "orchestrator:infra:runtime:sidecar_manager", message: `Attempting to spawn: ${name}` });
            const binPath = await this.findBinary(name);
            if (!binPath) {
                this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.ERROR, caller: "orchestrator:infra:runtime:sidecar_manager", message: `Binary not found for: ${name}` });
                this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_NOT_FOUND", sidecar: name });
                return null;
            }

            const isDev = Deno.env.get("CTS_DEV_MODE") === "true";
            
            // ENHANCEMENT: Transition to Linux Capabilities (setcap)
            // Removes dependency on sudo -n for sidecar execution
            // We use secure_spawn.sh to move the binary to a secure directory BEFORE verification/execution to mitigate TOCTOU
            // NOTE: In DEV_MODE we execute in-place to avoid requiring root-owned /var/lib/cts permissions
            let execPath = binPath;

            if (!isDev) {
                const caps = this.getCapabilities(name) || "";
                const spawnScript = await this.findScript("secure_spawn.sh");
                if (spawnScript) {
                    const res = await this.executor.execute(spawnScript, [name, binPath, caps]);
                    if (res.success) {
                        execPath = `/var/lib/cts/bin/${name}`;
                    }
                } else {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:infra:runtime:sidecar_manager",
                        message: "CRITICAL: secure_spawn.sh not found. Sidecar deployment will be unprivileged and potentially insecure."
                    });
                }
            }

            // ENHANCEMENT: Self-Healing Sidecars
            // Verify integrity AFTER move to secure location (Skip in DEV_MODE to allow debug binaries)
            if (!isDev) {
              const isHealthy = await this.verifyAndHeal(name, execPath);
              if (!isHealthy) {
                  this.logging.log({
                      timestamp: new Date().toISOString(),
                      type: LogType.AUDIT,
                      severity: LogSeverity.ERROR,
                      caller: "orchestrator:infra:runtime:sidecar_manager",
                      message: `CRITICAL: Sidecar ${name} integrity check failed at secure location and self-healing was unsuccessful.`
                  });
                  return null;
              }
            }

            const env = await this.getSidecarEnv(name);

            const command = new Deno.Command(execPath, {
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
                caller: "orchestrator:infra:runtime:sidecar_manager",
                message: `Spawned persistent sidecar: ${name}`
            });

            child.status.then((status) => {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: status.code === 0 ? LogSeverity.INFO : LogSeverity.WARNING,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
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
                                caller: `${name}:stderr`,
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
                        caller: "orchestrator:infra:runtime:sidecar_manager",
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
    
    const isDev = Deno.env.get("CTS_DEV_MODE") === "true";
    const paths = [
      envPath,
      `/opt/cts/bin/${name}${extension}`,
      `/usr/local/bin/cts-${name}${extension}`,
      `./agents/${name}${extension}`,
      ...(isDev ? [
        `./src/agents/target/release/${name}${extension}`,
        `./src/agents/target/debug/${name}${extension}`,
      ] : [])
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
        const real = await Deno.realPath(p);
        this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.INFO, caller: "orchestrator:infra:runtime:sidecar_manager", message: `findBinary(${name}) -> ${real}` });
        return real;
      } catch (e) {
        // Silent fail for stat
      }
    }
    this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.ERROR, caller: "orchestrator:infra:runtime:sidecar_manager", message: `Could not find binary for ${name} in any searched path.` });
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
          const trimmed = line.trim();
          if (!trimmed) continue;

          // New: Structured Log Ingestion
          if (trimmed.startsWith("[LOG] ")) {
            try {
                const logData = JSON.parse(trimmed.substring(6));
                this.logging.log({
                    timestamp: logData.timestamp || new Date().toISOString(),
                    type: logData.log_type || LogType.ACTIVITY,
                    severity: logData.severity || LogSeverity.INFO,
                    caller: logData.caller || `${name}:main`,
                    message: logData.message
                });
                // Note: We continue here if it's a pure log, but tactical events use standard JSON
                continue; 
            } catch { /* malformed log, continue to regular parsing */ }
          }

          try {
            const data = JSON.parse(trimmed) as SidecarResponse;

            if (!validateResponse(name as SidecarName, data)) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.ERROR,
                  caller: "orchestrator:infra:runtime:sidecar_manager",
                  message: `[${name}] Security violation: Invalid response schema. Payload: ${trimmed.substring(0, 200)}${trimmed.length > 200 ? "..." : ""}`
              });
              continue;
            }

            if (data.id && this.responseWaiters.has(name)) {
              const waiters = this.responseWaiters.get(name)!;
              const waiter = waiters.get(data.id);
              if (waiter) {
                waiter.resolve({ success: !!data.success, stdout: data.stdout || "", stderr: data.stderr || "", data: data.data });

                // BUG-4.22 FIX: Also emit to event handlers even if it was a direct response
                // This ensures Autopilot/Mediator can see results of manual scans/commands
                const handlers = this.eventHandlers.get(name) || [];
                for (const handler of handlers) {
                  handler(data);
                }

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
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: `[${name}] Response reader error: ${(e as Error).message}`
      });
    } finally {
      reader.releaseLock();
      // Ensure the process entry is removed and cleanup any pending buffers
      this.persistentProcesses.delete(name);
      buffer = "";
    }
  }

  private async findScript(name: string): Promise<string | null> {
    const paths = [
        `/var/lib/cts/scripts/${name}`,
        `./scripts/${name}`
    ];
    for (const p of paths) {
        try {
            const info = await Deno.stat(p);
            if (info.isFile) return await Deno.realPath(p);
        } catch { /* ignore */ }
    }
    return null;
  }

  private async getSidecarEnv(name: string): Promise<Record<string, string>> {
    const env: Record<string, string> = {
        "CTS_SIDECAR_NAME": name,
        "RUST_LOG": "info"
    };

    if (name === "sentinel" || name === "netcap") {
        if (!this.defaultInterface) {
            const { getDefaultInterface } = await import("../system/network.ts");
            this.defaultInterface = await getDefaultInterface();
        }
        env["CTS_IFACE"] = this.defaultInterface;
    }

    if (name === "netcap") {
        env["CTS_CAPTURE_DIR"] = "./volume/storage/captures";
    }

    return env;
  }

  async sendCommand(name: string, cmd: string | object): Promise<CommandResult> {
    const child = await this.getPersistentSidecar(name);
    if (!child) return { success: false, stdout: "", stderr: `Sidecar ${name} not found` };

    const id = crypto.randomUUID();
    let commandObj: any = typeof cmd === "string" ? { id, type: cmd } : { ...cmd, id };

    if (!validateRequest(name as SidecarName, commandObj)) {
      return { success: false, stdout: "", stderr: `Security violation: Invalid command for sidecar '${name}'` };
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
    this.isShuttingDown = true;
    if (this.rotationInterval) clearInterval(this.rotationInterval);
    for (const timer of this.backoffTimers) clearTimeout(timer);
    this.backoffTimers.clear();

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.ACTIVITY,
        severity: LogSeverity.INFO,
        caller: "orchestrator:infra:runtime:sidecar_manager",
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

  private getCapabilities(name: string): string | undefined {
    // BUG-4.5 FIX: Use SIDECAR_REGISTRY for capability mapping to allow new sidecars to work
    return SIDECAR_REGISTRY[name]?.capabilities;
  }

  private async verifyAndHeal(name: string, binPath: string, force: boolean = false): Promise<boolean> {
    const currentHash = await this.calculateHash(binPath);
    if (!currentHash && !force) return false;

    // Authoritative check against Signed Manifest
    const isProduction = Deno.env.get("ENVIRONMENT") === "production";
    const goldenHash = this.manifest?.sidecars?.[name]?.hash || Deno.env.get(`CTS_HASH_${name.toUpperCase()}`);

    // BUG-05: Make manifest mandatory in production
    if (isProduction && !this.manifest?.sidecars?.[name]?.hash) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `CRITICAL: No manifest entry for ${name} in production. Failing closed.`
        });
        return false;
    }
    
    if (!force && (!goldenHash || currentHash === goldenHash)) {
        return true; 
    }

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:infra:runtime:sidecar_manager",
        message: `Integrity Mismatch for ${name}! Expected: ${goldenHash?.slice(0, 8) || "UNKNOWN"}, Actual: ${currentHash?.slice(0, 8) || "UNKNOWN"}. Attempting resurrection...`
    });

    // SELF-HEALING: Attempt to rotate from golden repository
    try {
        const goldenRepo = `./volume/storage/agents/golden/${name}`;
        const goldenStat = await Deno.stat(goldenRepo).catch(() => null);
        
        if (goldenStat?.isFile) {
            await Deno.copyFile(goldenRepo, binPath);
            const healedHash = await this.calculateHash(binPath);
            
            if (healedHash === goldenHash) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
                    message: `Successfully healed sidecar ${name}. Integrity restored.`
                });
                return true;
            }
        }
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `Healing failed for ${name}: ${(e as Error).message}`
        });
    }

    return false;
  }

  private async calculateHash(path: string): Promise<string | null> {
    try {
        const file = await Deno.open(path, { read: true });
        try {
            const hashBuffer = await this.digestStream("SHA-256", file.readable);
            return Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, "0")).join("");
        } finally {
            try { file.close(); } catch { /* already closed */ }
        }
    } catch {
        return null;
    }
  }

  private async digestStream(algorithm: string, stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
      // Manual streaming digest to maintain compatibility with standard Web Crypto which lacks ReadableStream support
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      try {
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
          }
      } finally {
          reader.releaseLock();
      }

      // Concat and digest (Still better than Deno.readFile as we control the read loop,
      // but ideally we'd use a crypto library that supports incremental updates)
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
      }

      return await crypto.subtle.digest(algorithm, combined);
  }

  private handleSidecarExit(name: string, exitCode: number) {
    if (exitCode === 0 || this.isShuttingDown) return;
    if (this.unsupportedSidecars.has(name)) return;

    const now = Date.now();
    const restartInfo = this.restartCounts.get(name) || { count: 0, lastRestart: 0 };

    // Reset counter if the process was stable for more than 5 minutes
    if (now - restartInfo.lastRestart > 300000) {
        restartInfo.count = 0;
    }

    const MAX_RETRY_ATTEMPTS = 5;
    const COOLOFF_WINDOW = 600000; // 10 minutes

    if (restartInfo.count < MAX_RETRY_ATTEMPTS) {
      restartInfo.count++;
      restartInfo.lastRestart = now;
      this.restartCounts.set(name, restartInfo);

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
      const delay = Math.pow(2, restartInfo.count - 1) * 1000;

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: `Sidecar ${name} crashed (exit code ${exitCode}). Restarting in ${delay}ms (attempt ${restartInfo.count}/${MAX_RETRY_ATTEMPTS})`
      });

      const timer = setTimeout(() => {
        this.backoffTimers.delete(timer);
        if (!this.isShuttingDown) {
            this.getPersistentSidecar(name).catch(() => {});
        }
      }, delay);
      this.backoffTimers.add(timer);
    } else {
      const msg = `CRITICAL: Sidecar ${name} entered crash loop. Circuit breaker active for ${COOLOFF_WINDOW / 1000}s.`;
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: msg
      });
      this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_CRASH_LOOP", sidecar: name, message: msg });

      // Circuit Breaker: Reset after cooloff period
      setTimeout(() => {
          this.restartCounts.delete(name);
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.INFO,
              caller: "orchestrator:infra:runtime:sidecar_manager",
              message: `Circuit breaker reset for ${name}. Resuming lifecycle monitoring.`
          });
      }, COOLOFF_WINDOW);
    }
  }
}
