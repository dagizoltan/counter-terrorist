import { isAllowedSidecar, SidecarResponse, validateRequest, validateResponse, SidecarName } from "../system/validation.ts";
import { SystemExecutor } from "../system/system_executor.ts";
import { CommandResult, LoggingPort, LogSeverity, LogType, ConfigurationPort, TpmPort, CommandPort } from "@core/ports.ts";
import { SIDECAR_REGISTRY, PERSISTENT_SIDECARS } from "./sidecar_registry.ts";
import { SecretRedactor } from "@core/utils/security.ts";
import { CircuitBreaker } from "@core/utils/resilience.ts";
import { IpcFfiBridge } from "./ipc_ffi_bridge.ts";
import { HeartbeatMonitor } from "./heartbeat_monitor.ts";
import { serviceLocator } from "@core/service_locator.ts";
import { LsmLearningService } from "@domain/protection/lsm_learning_service.ts";
import { SidecarRepository } from "./sidecar_repository.ts";
import { IntegrityManager } from "./integrity_manager.ts";
import { SidecarSpawner } from "./sidecar_spawner.ts";
import { IpcCoordinator } from "./ipc_coordinator.ts";

/**
 * Manages persistent Rust sidecars.
 */
export class SidecarManager implements CommandPort {
  private config?: ConfigurationPort;
  private persistentProcesses: Map<string, Deno.ChildProcess> = new Map();
  private restartCounts: Map<string, { count: number, lastRestart: number }> = new Map();
  private responseWaiters: Map<string, Map<string, { resolve: (data: CommandResult) => void, reject: (err: Error) => void }>> = new Map();
  private eventHandlers: Map<string, ((data: SidecarResponse) => void)[]> = new Map();
  private unsupportedSidecars: Set<string> = new Set();
  private trippedSidecars: Set<string> = new Set();

  private ffi: IpcFfiBridge;
  private repository: SidecarRepository;
  private integrity: IntegrityManager;
  private spawner: SidecarSpawner;
  private ipc: IpcCoordinator;

  private expectedExits: Set<string> = new Set();
  private cleanupRegistered: boolean = false;
  private cleanupHandler: (() => Promise<void>) | null = null;
  private isShuttingDown: boolean = false;
  private defaultInterface: string | null = null;
  private rotationInterval?: number;
  private backoffTimers: Set<number> = new Set();
  private manifestPromise: Promise<void> | null = null;

  private tpm: TpmPort | undefined;
  private redactor: SecretRedactor = new SecretRedactor();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private heartbeatMonitor: HeartbeatMonitor;

  constructor(private executor: SystemExecutor, private logging: LoggingPort) {
    this.ffi = new IpcFfiBridge(logging);
    this.repository = new SidecarRepository(logging);
    this.integrity = new IntegrityManager(logging, executor, this.ffi);
    this.spawner = new SidecarSpawner(logging, executor);
    this.ipc = new IpcCoordinator(logging, this.ffi);

    this.heartbeatMonitor = new HeartbeatMonitor(logging, (name) => {
        this.emitEvent("SYSTEM_ERROR", {
            type: "SIDECAR_CRASH_LOOP",
            sidecar: name,
            critical: true,
            message: `Heartbeat Timeout: ${name}`
        });
    });
    this.registerCleanup();
  }

  public init() {
    this.startRotationLoop();
    this.heartbeatMonitor.start(() => Array.from(this.persistentProcesses.keys()));
    if (this.config) {
        this.manifestPromise = this.repository.loadManifest(this.config);
    }
  }

  setConfig(config: ConfigurationPort) {
    this.config = config;
    this.redactor.updateSecrets({
      MESH_SECRET: config.getEnv("MESH_SECRET"),
      API_TOKEN: config.getToken()
    });
  }

  setTpm(tpm: TpmPort) {
    this.tpm = tpm;
  }

  getTpm(): TpmPort | undefined {
      return this.tpm;
  }

  getFfi(): IpcFfiBridge {
    return this.ffi;
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
    if (!this.config) return;
    const sidecarConfig = SIDECAR_REGISTRY[name];
    const binPath = `./bin/agents/${sidecarConfig.binaryName || name}`;
    
    // 1. Forced re-healing from Golden Repository
    const healed = await this.integrity.verifyAndHeal(name, binPath, this.repository.getManifest(), this.config, true);
    
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

    this.cleanupHandler = async () => {
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

    Deno.addSignalListener("SIGINT", this.cleanupHandler);
    Deno.addSignalListener("SIGTERM", this.cleanupHandler);
    this.cleanupRegistered = true;
  }

  async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    if (!this.config) return { success: false, stdout: "", stderr: "Configuration not set" };
    if (!isAllowedSidecar(name)) {
      return { success: false, stdout: "", stderr: `Sidecar '${name}' is not in the allowlist.` };
    }

    if (PERSISTENT_SIDECARS.includes(name)) {
      return { success: false, stdout: "", stderr: `Sidecar '${name}' is a persistent daemon. Use getPersistentSidecar() instead.` };
    }

    const binPath = await this.repository.findBinary(name, this.config);
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

    if (this.trippedSidecars.has(name)) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `Execution blocked for ${name}: Circuit breaker is active.`
        });
        return null;
    }
    
    // If already running, return it
    if (this.persistentProcesses.has(name)) return this.persistentProcesses.get(name)!;

    // If currently spawning, wait for the existing promise
    if (this.spawningPromises.has(name)) {
        return await this.spawningPromises.get(name)!;
    }

    // Initiate spawn with a lock
    const spawnPromise = (async () => {
        try {
            if (!this.config) return null;
            this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.INFO, caller: "orchestrator:infra:runtime:sidecar_manager", message: `Attempting to spawn: ${name}` });
            const binPath = await this.repository.findBinary(name, this.config);
            if (!binPath) {
                this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.ERROR, caller: "orchestrator:infra:runtime:sidecar_manager", message: `Binary not found for: ${name}` });
                this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_NOT_FOUND", sidecar: name });
                return null;
            }

            const isDev = this.config.getBoolean("CTS_DEV_MODE", false);
            
            // SOV-03 FIX: Verify integrity and heal before spawn
            if (!isDev) {
              const isHealthy = await this.integrity.verifyAndHeal(name, binPath, this.repository.getManifest(), this.config);
              if (!isHealthy) {
                  this.logging.log({
                      timestamp: new Date().toISOString(),
                      type: LogType.AUDIT,
                      severity: LogSeverity.ERROR,
                      caller: "orchestrator:infra:runtime:sidecar_manager",
                      message: `CRITICAL: Sidecar ${name} integrity check failed.`
                  });
                  return null;
              }
            }

            const env = await this.getSidecarEnv(name);
            const child = await this.spawner.spawn(name, binPath, env, this.config);
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

            // SOV-P5: Apply Dynamic Landlock Policies from Learning Mode
            if (name !== "sentinel" && serviceLocator.has("lsmLearning")) {
                const lsm = serviceLocator.get<LsmLearningService>("lsmLearning");
                const allowlist = lsm.generateAllowlist(name);
                if (allowlist.length > 0) {
                    const landlock_rules = allowlist.map(entry => {
                        const [syscall, path] = entry.split(":");
                        return { path, syscalls: [syscall] };
                    }).filter(r => !!r.path);

                    if (landlock_rules.length > 0) {
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity: LogSeverity.INFO,
                            caller: "orchestrator:infra:runtime:sidecar_manager",
                            message: `Applying learned Landlock policy to ${name} (${landlock_rules.length} rules)...`
                        });

                        // Target sidecar applies its own Landlock policy
                        this.sendCommand(name, {
                            type: "EnforceLandlock",
                            rules: landlock_rules
                        }).catch(e => {
                            this.logging.log({
                                timestamp: new Date().toISOString(),
                                type: LogType.AUDIT,
                                severity: LogSeverity.ERROR,
                                caller: "orchestrator:infra:runtime:sidecar_manager",
                                message: `Failed to apply Landlock to ${name}: ${e.message}`
                            });
                        });
                    }
                }
            }

    // SOV-P5: Shared Memory Data Plane Ingestion
    if (name === "sentinel" || name === "netcap") {
        this.ipc.setupSharedMemory(name, child.pid).catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:sidecar_manager",
                message: `Failed to map shmem for ${name}: ${e.message}`
            });
        });
    }

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
    const config = SIDECAR_REGISTRY[name];
    const binName = config?.binaryName || name;
    
    // Support environment variable overrides for custom binary locations
    const envPath = this.config?.getEnv(`CTS_BINARY_${name.toUpperCase()}`);
    
    const isDev = this.config?.getBoolean("CTS_DEV_MODE", false);
    const paths = [
      envPath,
      `/opt/cts/bin/${binName}${extension}`,
      `/usr/local/bin/cts-${binName}${extension}`,
      `./agents/${binName}${extension}`,
      `./bin/agents/${binName}${extension}`,
      ...(isDev ? [
        `./src/agents/target/release/${binName}${extension}`,
        `./src/agents/target/debug/${binName}${extension}`,
      ] : [])
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (!p) continue;
      try {
        const info = await Deno.stat(p);
        if (!info.isFile) continue;
        return await Deno.realPath(p);
      } catch (_e) {
        // Silent fail for stat
      }
    }
    this.logging.log({ timestamp: new Date().toISOString(), type: LogType.DEBUG, severity: LogSeverity.ERROR, caller: "orchestrator:infra:runtime:sidecar_manager", message: `Could not find binary for ${name} in any searched path.` });
    return null;
  }

  isRunning(name: string): boolean {
    return this.persistentProcesses.has(name) && !this.unsupportedSidecars.has(name);
  }

  private handleIpcLine(name: string, trimmed: string) {
          try {
            // SOV-P4: Robust IPC Recursion Depth & Complexity Limiter
            // Ignores brackets within string literals to prevent false positives.
            const MAX_DEPTH = 8;
            let depth = 0;
            let maxSeenDepth = 0;
            let inString = false;
            let escaped = false;

            for (let i = 0; i < trimmed.length; i++) {
                const char = trimmed[i];
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === "\\") {
                    escaped = true;
                    continue;
                }
                if (char === "\"") {
                    inString = !inString;
                    continue;
                }

                if (!inString) {
                    if (char === "{" || char === "[") {
                        depth++;
                        if (depth > maxSeenDepth) maxSeenDepth = depth;
                    } else if (char === "}" || char === "]") {
                        depth--;
                    }
                }
                if (depth > MAX_DEPTH) break;
            }

            if (depth > MAX_DEPTH || maxSeenDepth > MAX_DEPTH) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
                    message: `[${name}] CRITICAL: Maliciously deep JSON detected in IPC (depth=${maxSeenDepth}). Rejecting payload.`
                });
                return;
            }

            // SOV-06 SECURITY: Redact sensitive payloads from IPC before they are processed or logged
            const redactedLine = this.redactor.redact(trimmed);
            const data = JSON.parse(redactedLine) as SidecarResponse;

            if (!validateResponse(name as SidecarName, data)) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.ERROR,
                  caller: "orchestrator:infra:runtime:sidecar_manager",
                  message: `[${name}] Security violation: Invalid response schema. Payload: ${trimmed.substring(0, 200)}${trimmed.length > 200 ? "..." : ""}`
              });
              return;
            }

            if (data.id && this.responseWaiters.has(name)) {
              const waiters = this.responseWaiters.get(name)!;
              const waiter = waiters.get(data.id);
              if (waiter) {
                waiter.resolve({ success: !!data.success, stdout: data.stdout || "", stderr: data.stderr || "", data: data.data as Record<string, any> | undefined, message: data.message });

                // BUG-4.22 FIX: Also emit to event handlers even if it was a direct response
                // This ensures Autopilot/Mediator can see results of manual scans/commands
                const handlers = this.eventHandlers.get(name) || [];
                for (const handler of handlers) {
                  handler(data);
                }

                waiters.delete(data.id);
                return;
              }
            }

            const handlers = this.eventHandlers.get(name) || [];
            for (const handler of handlers) {
              handler(data);
            }
          } catch (e) {
            // H-08: Log malformed IPC output for forensic analysis in pilots
            if (trimmed.length > 0) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.DEBUG,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
                    message: `[${name}] Malformed IPC JSON detected: ${trimmed.substring(0, 100)}${trimmed.length > 100 ? "..." : ""}`,
                    payload: { error: (e as Error).message }
                });
            }
          }
  }

  private async startResponseReader(name: string, child: Deno.ChildProcess) {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // SOV-P3: Defensive IPC Hardening
    const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_LINE_LENGTH = 1024 * 1024; // 1MB

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // SEC-05: Stricter DoS prevention for IPC ingestion.
        // We check the cumulative buffer size *before* decoding or appending the new chunk.
        if (buffer.length + value.length > MAX_BUFFER_SIZE) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:sidecar_manager",
                message: `[${name}] CRITICAL: IPC buffer overflow. Eagerly dropping data to prevent OOM.`
            });
            buffer = "";
            // Also truncate the current chunk to avoid spikes
            const safeChunk = value.slice(0, Math.min(value.length, MAX_BUFFER_SIZE));
            buffer = decoder.decode(safeChunk, { stream: true });
        } else {
            buffer += decoder.decode(value, { stream: true });
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (line.length > MAX_LINE_LENGTH) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
                    message: `[${name}] Dropping over-sized IPC line (${line.length} bytes)`
                });
                continue;
            }
          const trimmed = line.trim();
          if (!trimmed) continue;

          // SOV-P4: Heartbeat tracking
          if (trimmed === "HEARTBEAT" || (trimmed.startsWith("{") && trimmed.includes("\"type\":\"HEARTBEAT\""))) {
              this.heartbeatMonitor.recordHeartbeat(name);
              if (trimmed === "HEARTBEAT") continue;
          }

          // SOV-P5: Shmem Update Signal
          if (trimmed.startsWith("SHMEM_UPDATE:")) {
              const shmemPtr = this.ipc.getShmemPtr(name);
              if (shmemPtr) {
                  const jsonStr = this.ffi.readShmem(shmemPtr);
                  if (jsonStr) {
                      this.handleIpcLine(name, jsonStr);
                  }
              }
              continue;
          }

          // New: Structured Log Ingestion
          if (trimmed.startsWith("[LOG] ")) {
            try {
                const logData = JSON.parse(trimmed.substring(6));

                // H-04: Limit message length from sidecars to prevent log-based DoS
                const MAX_LOG_MSG_LENGTH = 16384; // 16KB
                const rawMsg = String(logData.message || "");
                const sanitizedMsg = rawMsg.length > MAX_LOG_MSG_LENGTH
                    ? rawMsg.substring(0, MAX_LOG_MSG_LENGTH) + "... [TRUNCATED]"
                    : rawMsg;

                this.logging.log({
                    timestamp: logData.timestamp || new Date().toISOString(),
                    type: logData.log_type || LogType.ACTIVITY,
                    severity: logData.severity || LogSeverity.INFO,
                    caller: logData.caller || `${name}:main`,
                    message: sanitizedMsg
                });
                // Note: We continue here if it's a pure log, but tactical events use standard JSON
                continue;
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: LogSeverity.INFO,
                    caller: `${name}:raw_log`,
                    message: trimmed,
                    payload: { error: (e as Error).message }
                });
            }
          }

          this.handleIpcLine(name, trimmed);
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
      this.ipc.clearMappings(name);
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


  async sendCommand(name: string, cmd: string | Record<string, unknown>): Promise<CommandResult> {
    let breaker = this.circuitBreakers.get(name);
    if (!breaker) {
        breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30000 });
        this.circuitBreakers.set(name, breaker);
    }

    const breakerRes = await breaker.execute(async () => {
        const res = await this.rawSendCommand(name, cmd);
        if (!res.success) throw new Error(res.stderr);
        return res;
    });

    if (!breakerRes.success) {
        return { success: false, stdout: "", stderr: `Circuit Breaker: ${breakerRes.error.message}` };
    }

    return breakerRes.data;
  }

  private async rawSendCommand(name: string, cmd: string | Record<string, unknown>): Promise<CommandResult> {
    const child = await this.getPersistentSidecar(name) as Deno.ChildProcess | null;
    if (!child) return { success: false, stdout: "", stderr: `Sidecar ${name} not found` };

    const id = crypto.randomUUID();
    const commandObj = typeof cmd === "string" ? { id, type: cmd } : { ...cmd, id };

    if (!validateRequest(name as SidecarName, commandObj)) {
      return { success: false, stdout: "", stderr: `Security violation: Invalid command for sidecar '${name}'` };
    }

    const responsePromise = new Promise<CommandResult>((resolve, reject) => {
      if (!this.responseWaiters.has(name)) this.responseWaiters.set(name, new Map());
      this.responseWaiters.get(name)!.set(id, { resolve, reject });
    });

    const timeoutPromise = new Promise<CommandResult>((resolve) => {
      setTimeout(() => {
        if (this.responseWaiters.has(name)) this.responseWaiters.set(name, new Map());
        const waiters = this.responseWaiters.get(name);
        if (waiters) waiters.delete(id);
        resolve({ 
          success: false, 
          stdout: "", 
          stderr: `Command ${commandObj.type} to ${name} timed out after 60s` 
        });
      }, 60000);
    });

    const writer = child.stdin.getWriter();

    // SOV-P5: Try Shared Memory Control Plane first for supported high-volume agents
    if (name === "sentinel" || name === "netcap") {
        const cmdShmemPtr = this.ipc.getCmdShmemPtr(name);
        const binCmd = this.ffi.serializeMessagePack(commandObj);
        if (cmdShmemPtr && binCmd) {
            // Write to shared memory command buffer
            const success = this.ffi.writeShmem(cmdShmemPtr, binCmd);
            if (success) {
                writer.releaseLock();
                return Promise.race([responsePromise, timeoutPromise]);
            }
        }

        if (binCmd) {
            await writer.write(binCmd);
            writer.releaseLock();
            return Promise.race([responsePromise, timeoutPromise]);
        }
    }

    await writer.write(new TextEncoder().encode(JSON.stringify(commandObj) + "\n"));
    writer.releaseLock();

    return Promise.race([responsePromise, timeoutPromise]);
  }

  onEvent(name: string, handler: (data: SidecarResponse) => void) {
    if (!this.eventHandlers.has(name)) this.eventHandlers.set(name, []);
    this.eventHandlers.get(name)!.push(handler);
  }

  emitEvent(name: string, data: SidecarResponse) {
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
      this.expectedExits.add(name);
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
      } finally {
        this.persistentProcesses.delete(name);
        this.ipc.clearMappings(name);
        // We keep it in expectedExits for a short moment to let the event loop catch up
        setTimeout(() => this.expectedExits.delete(name), 100);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.rotationInterval) clearInterval(this.rotationInterval);
    this.heartbeatMonitor.stop();
    for (const timer of this.backoffTimers) clearTimeout(timer);
    this.backoffTimers.clear();

    if (this.cleanupHandler) {
        Deno.removeSignalListener("SIGINT", this.cleanupHandler);
        Deno.removeSignalListener("SIGTERM", this.cleanupHandler);
        this.cleanupHandler = null;
        this.cleanupRegistered = false;
    }

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

  /**
   * SOV-P4: External trigger for integrity verification and healing.
   */
  async triggerHeal(name: string): Promise<boolean> {
      if (!this.config) return false;
      const isDev = this.config.getBoolean("CTS_DEV_MODE", false);
      const binPath = isDev ? await this.repository.findBinary(name, this.config) : `/var/lib/cts/bin/${name}`;

      if (!binPath) return false;
      return await this.integrity.verifyAndHeal(name, binPath, this.repository.getManifest(), this.config, true);
  }

  getTrippedSidecars(): string[] {
      return Array.from(this.trippedSidecars);
  }

  private verifyUpgradeToken(token: string): boolean {
      // Logic to verify the transient upgrade token against TPM/ENV
      const envToken = this.config?.getEnv("CTS_MANIFEST_UPGRADE_TOKEN");
      return !!envToken && token === envToken;
  }



  private handleSidecarExit(name: string, exitCode: number) {
    if (exitCode === 0 || this.isShuttingDown || this.expectedExits.has(name)) {
        this.expectedExits.delete(name);
        return;
    }
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
            this.getPersistentSidecar(name).catch(e => loggingService.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "sidecar_manager", message: `Auto-restart failed for ${name}: ${e.message}` }).catch(() => {}));
        }
      }, delay);
      this.backoffTimers.add(timer);
    } else {
      this.trippedSidecars.add(name);
      const isCritical = SIDECAR_REGISTRY[name]?.critical || false;
      const msg = `${isCritical ? "FATAL" : "CRITICAL"}: Sidecar ${name} entered crash loop. Circuit breaker active for ${COOLOFF_WINDOW / 1000}s.`;

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: msg
      });
      this.emitEvent("SYSTEM_ERROR", {
          type: "SIDECAR_CRASH_LOOP",
          sidecar: name,
          message: msg,
          critical: isCritical
      });

      // Circuit Breaker: Reset after cooloff period with jitter (H-06)
      const jitter = Math.floor(Math.random() * 30000); // 30s jitter
      const resetTimer = setTimeout(() => {
          this.trippedSidecars.delete(name);
          this.restartCounts.delete(name);
          this.backoffTimers.delete(resetTimer);
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.INFO,
              caller: "orchestrator:infra:runtime:sidecar_manager",
              message: `Circuit breaker reset for ${name}. Resuming lifecycle monitoring.`
          });
      }, COOLOFF_WINDOW + jitter);
      this.backoffTimers.add(resetTimer);
    }
  }
}
