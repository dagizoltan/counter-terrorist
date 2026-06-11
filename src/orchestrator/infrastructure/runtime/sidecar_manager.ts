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
import { SidecarRotator } from "./sidecar_rotator.ts";
import { secureRandomInt } from "../../core/crypto_utils.ts";

/**
 * Manages persistent Rust sidecars.
 */
/**
 * SidecarManager handles the lifecycle and IPC of persistent Rust agents.
 * It manages process spawning, health monitoring, and secure shared-memory communication.
 */
export class SidecarManager implements CommandPort {
  private config?: ConfigurationPort;
  private persistentProcesses: Map<string, Deno.ChildProcess> = new Map();

  private ffi: IpcFfiBridge;
  private repository: SidecarRepository;
  private integrity: IntegrityManager;
  private spawner: SidecarSpawner;
  private ipc: IpcCoordinator;
  private rotator: SidecarRotator;

  private expectedExits: Set<string> = new Set();
  private cleanupRegistered: boolean = false;
  private cleanupHandler: (() => Promise<void>) | null = null;
  private isShuttingDown: boolean = false;
  private defaultInterface: string | null = null;
  private rotationInterval?: number | any;
  private backoffTimers: Set<number | any> = new Set();
  private manifestPromise: Promise<void> | null = null;
  private initialized = false;

  private tpm: TpmPort | undefined;
  private obfuscationKey: Uint8Array | null = null;
  private agentPublicKeys: Map<string, Uint8Array> = new Map();
  private redactor: SecretRedactor = new SecretRedactor();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private heartbeatMonitor: HeartbeatMonitor;

  constructor(private executor: SystemExecutor, private logging: LoggingPort) {
    this.ffi = new IpcFfiBridge(logging);
    this.repository = new SidecarRepository(logging);
    this.integrity = new IntegrityManager(logging, executor, this.ffi);
    this.spawner = new SidecarSpawner(logging, executor, this.ffi);
    this.ipc = new IpcCoordinator(logging, this.ffi);
    this.rotator = new SidecarRotator(logging, this.integrity, this.repository, {
        stopSidecar: (name) => this.stopSidecar(name),
        getPersistentSidecar: (name) => this.getPersistentSidecar(name)
    });

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
    if (this.initialized) return;
    this.initialized = true;

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

    const meshSecret = config.getEnv("MESH_SECRET");
    if (meshSecret) {
        this.obfuscationKey = new TextEncoder().encode(meshSecret);
    }
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
   * Introduces jitter to prevent synchronized load across mesh nodes.
   */
  private startRotationLoop() {
    const ROTATION_INTERVAL = 6 * 60 * 60 * 1000; // 6 Hours
    // SOV-M5 FIX: Transition to secure random jitter
    const initialJitter = secureRandomInt(0, 30 * 60 * 1000); // 0-30 min jitter

    const rotationTimer = setTimeout(() => {
        this.backoffTimers.delete(rotationTimer);
        this.rotationInterval = setInterval(async () => {
            if (!this.config) return;
            await this.rotator.rotateAll(Array.from(this.persistentProcesses.keys()), this.config);
        }, ROTATION_INTERVAL);
    }, initialJitter);

    this.backoffTimers.add(rotationTimer);
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

  async getPersistentSidecar(name: string): Promise<Deno.ChildProcess | null> {
    await this.manifestPromise;
    if (!isAllowedSidecar(name)) throw new Error(`Sidecar '${name}' is not in the allowlist.`);
    if (this.spawner.isUnsupported(name)) return null;

    if (this.spawner.isTripped(name)) {
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
    const existingSpawn = this.spawner.getSpawningPromise(name);
    if (existingSpawn) {
        return await existingSpawn;
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
            
            // Verify integrity and heal before spawn
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

            // Apply Dynamic Landlock Policies from Learning Mode
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

    // Shared Memory Data Plane Ingestion
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
                                this.spawner.markUnsupported(name);
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
            // Record initial heartbeat to start monitoring immediately
            this.heartbeatMonitor.recordHeartbeat(name);
            this.startResponseReader(name, child);
            return child;
        } catch (e) {
            this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_SPAWN_FAILED", sidecar: name, error: (e as Error).message });
            return null;
        } finally {
            this.spawner.clearSpawningPromise(name);
        }
    })();

    this.spawner.setSpawningPromise(name, spawnPromise);
    return await spawnPromise;
  }

  isRunning(name: string): boolean {
    return this.persistentProcesses.has(name) && !this.spawner.isUnsupported(name);
  }

  private handleIpcLine(name: string, trimmed: string) {
          try {
            // Robust IPC Recursion Depth & Complexity Limiter
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

            if (data.id) {
              const waiter = this.ipc.getWaiter(name, data.id);
              if (waiter) {
                waiter.resolve({ success: !!data.success, stdout: data.stdout || "", stderr: data.stderr || "", data: data.data as Record<string, any> | undefined, message: data.message });

                // Also emit to event handlers even if it was a direct response
                this.ipc.emitEvent(name, data);
                this.ipc.removeWaiter(name, data.id);
                return;
              }
            }

            this.ipc.emitEvent(name, data);
          } catch (e) {
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

    const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_LINE_LENGTH = 1024 * 1024; // 1MB

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (buffer.length + value.length > MAX_BUFFER_SIZE) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:sidecar_manager",
                message: `[${name}] CRITICAL: IPC buffer overflow. Eagerly dropping data to prevent OOM.`
            });
            buffer = "";
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

          if (trimmed === "HEARTBEAT" || (trimmed.startsWith("{") && trimmed.includes("\"type\":\"HEARTBEAT\""))) {
              this.heartbeatMonitor.recordHeartbeat(name);
              if (trimmed === "HEARTBEAT") continue;
          }

          if (trimmed.startsWith("SHMEM_UPDATE:")) {
              const shmemPtr = this.ipc.getShmemPtr(name);
              if (shmemPtr) {
                  // SOV-M4: Pull all available messages from the ring buffer
                  // Pre-load agent public key for signing verification if available
                  const pubKey = this.agentPublicKeys.get(name);

                  let jsonStr;
                  while ((jsonStr = this.ffi.pullRingEvent(shmemPtr, this.obfuscationKey || undefined, pubKey)) !== null) {
                      this.handleIpcLine(name, jsonStr);
                  }
              }
              continue;
          }

          if (trimmed.startsWith("[LOG] ")) {
            try {
                const logData = JSON.parse(trimmed.substring(6));
                const MAX_LOG_MSG_LENGTH = 16384;
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
      this.persistentProcesses.delete(name);
      await this.ipc.clearMappings(name);
      buffer = "";
    }
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

    const meshSecret = this.config?.getEnv("MESH_SECRET");
    if (meshSecret) {
        env["CTS_MESH_SECRET"] = meshSecret;
    }

    if (name === "netcap") {
        env["CTS_CAPTURE_DIR"] = "./volume/storage/captures";
    }

    return env;
  }


  /**
   * Sends a control-plane command to a specific sidecar.
   * Utilizes shared memory for high-performance data planes if available.
   *
   * @param name Sidecar identifier
   * @param cmd Command string or structured object
   */
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
      this.ipc.addWaiter(name, id, { resolve, reject });
    });

    // SEC-05 Hardening: Tiered IPC Timeouts (Audit 10.2)
    // High-priority remediation commands have aggressive timeouts to prevent orchestrator blocking
    // and trigger rapid agent health evaluation/restart if they stall.
    const type = commandObj.type as string;
    const isHighPriority = ["KillProcess", "BlockIp", "QuarantineProcess", "DumpProcess", "LOCKDOWN", "ENFORCE_PID"].includes(type);
    const timeoutMs = isHighPriority ? 5000 : 60000;

    const timeoutPromise = new Promise<CommandResult>((resolve) => {
      setTimeout(() => {
        this.ipc.removeWaiter(name, id);
        this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: `CRITICAL: Command ${type} to sidecar ${name} timed out after ${timeoutMs}ms. Potential agent stall.`
        });
        resolve({ 
          success: false, 
          stdout: "", 
          stderr: `Command ${type} to ${name} timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);
    });

    const writer = child.stdin.getWriter();

    if (name === "sentinel" || name === "netcap") {
        const cmdShmemPtr = this.ipc.getCmdShmemPtr(name);
        const binCmd = this.ffi.serializeMessagePack(commandObj);
        if (cmdShmemPtr && binCmd) {
            const success = this.ffi.writeShmem(cmdShmemPtr, binCmd, this.obfuscationKey || undefined);
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
    this.ipc.onEvent(name, handler);
  }

  emitEvent(name: string, data: SidecarResponse) {
    this.ipc.emitEvent(name, data);
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
        const timeout = setTimeout(() => {
          try { process.kill("SIGKILL"); } catch { /* ignore */ }
        }, 2000);
        await process.status;
        clearTimeout(timeout);
      } catch {
        try { process.kill("SIGKILL"); } catch { /* ignore */ }
      } finally {
        this.persistentProcesses.delete(name);
        await this.ipc.clearMappings(name);
        setTimeout(() => this.expectedExits.delete(name), 100);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.initialized = false;
    if (this.rotationInterval) {
        clearInterval(this.rotationInterval);
        this.rotationInterval = undefined;
    }
    this.heartbeatMonitor.stop();
    for (const timer of this.backoffTimers) clearTimeout(timer);
    this.backoffTimers.clear();
    await this.ipc.shutdown();

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

  async triggerHeal(name: string): Promise<boolean> {
      if (!this.config) return false;
      const isDev = this.config.getBoolean("CTS_DEV_MODE", false);
      const binPath = isDev ? await this.repository.findBinary(name, this.config) : `/var/lib/cts/bin/${name}`;

      if (!binPath) return false;
      return await this.integrity.verifyAndHeal(name, binPath, this.repository.getManifest(), this.config, true);
  }

  getTrippedSidecars(): string[] {
      return this.spawner.getTrippedSidecars();
  }

  private handleSidecarExit(name: string, exitCode: number) {
    // SOV-M5 Hardening: Treat code 0 as a failure for persistent sidecars to prevent silent disablement
    const isExpected = this.isShuttingDown || this.expectedExits.has(name);

    if (isExpected) {
        this.expectedExits.delete(name);
        return;
    }

    if (exitCode === 0) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `Sidecar ${name} exited with code 0 (Success) unexpectedly. Persistent agents should not exit. Restarting...`
        });
    }
    if (this.spawner.isUnsupported(name)) return;

    const now = Date.now();
    const restartInfo = this.spawner.getRestartInfo(name);

    if (now - restartInfo.lastRestart > 300000) {
        restartInfo.count = 0;
    }

    const MAX_RETRY_ATTEMPTS = 5;
    const COOLOFF_WINDOW = 600000;

    if (restartInfo.count < MAX_RETRY_ATTEMPTS) {
      restartInfo.count++;
      restartInfo.lastRestart = now;
      this.spawner.setRestartInfo(name, restartInfo);

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
            this.getPersistentSidecar(name).catch(e => this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "sidecar_manager",
                message: `Auto-restart failed for ${name}: ${e.message}`
            }));
        }
      }, delay);
      this.backoffTimers.add(timer);
    } else {
      this.spawner.markTripped(name);
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

      // SOV-M5 FIX: Transition to secure random jitter
      const jitter = secureRandomInt(0, 30000);
      const resetTimer = setTimeout(() => {
          this.spawner.clearTripped(name);
          this.spawner.clearRestartInfo(name);
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
