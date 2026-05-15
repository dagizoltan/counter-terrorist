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

  private manifest: any = null;
  private manifestPromise: Promise<void> | null = null;

    this.startRotationLoop();
    if (Deno.build.os !== "windows") {
        this.startUdsTelemetry();
    }
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
        
        // ── Auto-Start Persistent Agents ────────────────────────────────────
        // Ensures all critical defense agents are active from boot, not just on-demand.
        // We prioritize sentinel to ensure XDP/eBPF is active as early as possible.
        const prioritized = ["sentinel", ...PERSISTENT_SIDECARS.filter(s => s !== "sentinel")];

        for (const name of prioritized) {
            // BUG-06: Filter agents by current platform to avoid spawn failures
            if (name.endsWith("-win") && Deno.build.os !== "windows") continue;
            if (name.endsWith("-darwin") && Deno.build.os !== "darwin") continue;
            if (name === "sentinel" && Deno.build.os !== "linux") continue;

            this.getPersistentSidecar(name).catch(e => {
                if (this.logging) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:infra:runtime:sidecar_manager",
                        message: `Failed to auto-start persistent sidecar ${name}: ${e instanceof Error ? e.message : String(e)}`
                    });
                }
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
    setInterval(async () => {
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
        await this.getPersistentSidecar(name).catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:sidecar_manager:rotate",
                message: `Failed to spawn ${name} after rotation: ${(e as Error).message}`
            });
        });
        
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

  private udsListener: Deno.Listener | null = null;

  private async startUdsTelemetry() {
    const udsPath = "./volume/run/telemetry.sock";
    try { Deno.mkdirSync("./volume/run", { recursive: true }); } catch {}
    try { Deno.removeSync(udsPath); } catch {}
    
    try {
        this.udsListener = Deno.listen({ transport: "unix", path: udsPath });
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `Unified IPC Telemetry Socket Listener started at ${udsPath}`
        }).catch(() => {});
        this.acceptUdsConnections();
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:infra:runtime:sidecar_manager",
            message: `Failed to start UDS Listener: ${(e as Error).message}`
        }).catch(() => {});
    }
  }

  private async acceptUdsConnections() {
    if (!this.udsListener) return;
    try {
        for await (const conn of this.udsListener) {
            this.handleUdsConnection(conn).catch(() => {});
        }
    } catch {
        // Listener closed
    }
  }

  private async handleUdsConnection(conn: Deno.Conn) {
    const reader = conn.readable.getReader();
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

                try {
                    const data = JSON.parse(trimmed);

                    // Check if it's a ForensicLog
                    if (data.log_type || data.severity || (data.message && !("success" in data))) {
                        this.logging.log({
                            timestamp: data.timestamp || new Date().toISOString(),
                            type: data.log_type || LogType.ACTIVITY,
                            severity: data.severity || LogSeverity.INFO,
                            caller: data.caller || "sidecar:uds",
                            message: data.message,
                            payload: data.payload
                        });
                        continue;
                    }

                    // Otherwise treat as SidecarResponse
                    const name = "sentinel"; // In UDS we might not know the sidecar name unless it sends it, defaulting to sentinel for POC.
                    // Wait, if we don't know the name, we can't route correctly to responseWaiters! 
                    // Let's assume the sidecar provides a `sidecar` field or we iterate waiters.
                    const sidecarName = data.sidecar || "sentinel"; 

                    if (data.id && this.responseWaiters.has(sidecarName)) {
                        const waiters = this.responseWaiters.get(sidecarName)!;
                        const waiter = waiters.get(data.id);
                        if (waiter) {
                            waiter.resolve({ success: !!data.success, stdout: data.stdout || "", stderr: data.stderr || "", data: data.data });
                            waiters.delete(data.id);
                            continue;
                        }
                    }

                    // Emit event
                    const handlers = this.eventHandlers.get(sidecarName) || [];
                    for (const handler of handlers) {
                        handler(data);
                    }
                } catch (e) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.DEBUG,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:infra:runtime:sidecar_manager",
                        message: `Malformed UDS telemetry: ${trimmed.substring(0, 50)}... Error: ${(e as any).message}`
                    });
                }
            }
        }
    } finally {
        reader.releaseLock();
        conn.close();
    }
  }

  async shutdown() {
    if (this.isShuttingDown) return;
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

            const supportsAttestation = ["sentinel", "analyzer", "enforcer", "tunnel"].includes(name);
            const env = await this.getSidecarEnv(name, supportsAttestation);

            let finalExecPath = execPath;
            let finalArgs: string[] = [];

            // ENHANCEMENT: Capabilities-First Execution
            // We check if the binary has the required capabilities set. 
            // If it does, we don't need sudo, even if it's a privileged sidecar.
            let hasCaps = false;
            if (Deno.build.os === "linux") {
                try {
                    const checkCaps = await this.executor.execute("getcap", [execPath]);
                    if (checkCaps.success && checkCaps.stdout.includes("=")) {
                        hasCaps = true;
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.DEBUG,
                            severity: LogSeverity.INFO,
                            caller: "orchestrator:infra:runtime:sidecar_manager",
                            message: `Capabilities detected for ${name}. Bypassing sudo.`
                        });
                    }
                } catch { /* ignore */ }
            }

            if (isDev && PRIVILEGED_SIDECARS.includes(name) && Deno.uid() !== 0 && !hasCaps) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
                    message: `CRITICAL: Sidecar ${name} requires privileges but has no capabilities set. Refusing to run sudo in dev mode due to security risks. Please provision capabilities using 'setcap'.`
                });
                return null;
            }

            const command = new Deno.Command(finalExecPath, {
                args: finalArgs,
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

            // ENHANCEMENT: Sidecar Attestation Handshake
            if (!isDev && supportsAttestation) {
                const attested = await this.attestSidecar(name);
                if (!attested) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:infra:runtime:sidecar_manager",
                        message: `CRITICAL: Sidecar ${name} failed hardware attestation. Terminating for security.`
                    });
                    await this.stopSidecar(name);
                    return null;
                }

                // Provision secrets ONLY after successful attestation
                await this.provisionSidecarSecrets(name);
            } else if (supportsAttestation && isDev) {
                // In dev mode, we still provision secrets via command if attestation is skipped
                await this.provisionSidecarSecrets(name);
            }

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
    
    const manifestPath = this.manifest?.sidecars?.[name]?.path;
    
    const isDev = Deno.env.get("CTS_DEV_MODE") === "true";
    const paths = [
      envPath,
      manifestPath,
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
          if (trimmed.startsWith("[LOG]")) {
            try {
                const jsonStr = trimmed.startsWith("[LOG] ") ? trimmed.substring(6) : trimmed.substring(5);
                const logData = JSON.parse(jsonStr);
                this.logging.log({
                    timestamp: logData.timestamp || new Date().toISOString(),
                    type: logData.log_type || LogType.ACTIVITY,
                    severity: logData.severity || LogSeverity.INFO,
                    caller: logData.caller || `${name}:main`,
                    message: logData.message,
                    payload: logData.payload
                });
                // Note: We continue here if it's a pure log, but tactical events use standard JSON
                continue; 
            } catch (e) { 
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.DEBUG,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:infra:runtime:sidecar_manager",
                    message: `Malformed log from ${name}: ${trimmed.substring(0, 50)}... Error: ${(e as any).message}`
                });
            }
          }

          try {
            const data = JSON.parse(trimmed) as SidecarResponse;

            if (!validateResponse(name as SidecarName, data)) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.ERROR,
                  caller: "orchestrator:infra:runtime:sidecar_manager",
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
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: `[${name}] Response reader error: ${(e as Error).message}`
      });
    } finally {
      reader.releaseLock();
      this.persistentProcesses.delete(name);
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

  private async getSidecarEnv(name: string, supportsAttestation: boolean = false): Promise<Record<string, string>> {
    const env: Record<string, string> = {
        "CTS_SIDECAR_NAME": name,
        "RUST_LOG": "info"
    };

    const isDev = Deno.env.get("CTS_DEV_MODE") === "true";

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

    // If it supports attestation and we aren't in dev mode, we don't pass sensitive secrets via env
    if (supportsAttestation && !isDev) {
        // Secrets will be provisioned via sendCommand after attestation
    } else {
        // Fallback for legacy sidecars or dev mode
        const meshSecret = Deno.env.get("MESH_SECRET");
        if (meshSecret) env["MESH_SECRET"] = meshSecret;
    }

    return env;
  }

  /**
   * Performs a hardware-rooted attestation of the sidecar process.
   */
  private async attestSidecar(name: string): Promise<boolean> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:infra:runtime:sidecar_manager",
        message: `Initiating hardware attestation for ${name}...`
    });

    const nonce = crypto.randomUUID();
    const quoteRes = await this.sendCommand(name, { type: "QuoteIdentity", nonce });

    if (!quoteRes.success || !quoteRes.data) return false;

    // Verify the quote via trustroot (TPM)
    const verifyRes = await this.sendCommand("trustroot", {
        type: "VerifyQuote",
        quote: quoteRes.data.quote,
        pcr_state: quoteRes.data.pcr_state,
        nonce: quoteRes.data.nonce
    });

    return verifyRes.success;
  }

  /**
   * Provisions sensitive secrets to an attested sidecar.
   */
  private async provisionSidecarSecrets(name: string): Promise<void> {
    const meshSecret = Deno.env.get("MESH_SECRET");
    if (meshSecret) {
        await this.sendCommand(name, {
            type: "PROVISION_SECRET",
            key: "MESH_SECRET",
            value: meshSecret
        });
    }

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.SUCCESS,
        caller: "orchestrator:infra:runtime:sidecar_manager",
        message: `Provisioned secrets to attested sidecar: ${name}`
    });
  }

  async sendCommand(name: string, cmd: string | object): Promise<CommandResult> {
    const child = await this.getPersistentSidecar(name);
    if (!child) return { success: false, stdout: "", stderr: `Sidecar ${name} not found` };

    const id = crypto.randomUUID();
    let commandObj: Record<string, any> = typeof cmd === "string" ? { id, type: cmd } : { ...(cmd as object), id };

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
    await this.getPersistentSidecar(name).catch(e => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:infra:runtime:sidecar_manager:restart",
            message: `Failed to restart sidecar ${name}: ${(e as Error).message}`
        });
    });
  }

  async stopSidecar(name: string): Promise<void> {
    const process = this.persistentProcesses.get(name);
    if (process) {
      if (PRIVILEGED_SIDECARS.includes(name) && Deno.uid() !== 0) {
          // If it's privileged and we aren't root, we likely need sudo to kill it
          await this.executor.execute("kill", ["-15", process.pid.toString()]);
          // Wait a bit for graceful exit then force kill if needed
          await new Promise(r => setTimeout(r, 1000));
          await this.executor.execute("kill", ["-9", process.pid.toString()]);
      }
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


  getPID(name: string): number | null {
    const process = this.persistentProcesses.get(name);
    return process ? process.pid : null;
  }

  private getCapabilities(name: string): string | undefined {
    const caps: Record<string, string> = {
        "enforcer": "cap_net_admin,cap_kill+ep",
        "sentinel": "cap_sys_admin,cap_net_admin,cap_sys_resource+ep",
        "netcap": "cap_net_raw,cap_net_admin+ep",
        "tunnel": "cap_net_admin+ep"
    };
    return caps[name];
  }

  private async verifyAndHeal(name: string, binPath: string, force: boolean = false): Promise<boolean> {
    const currentHash = await this.calculateHash(binPath);
    if (!currentHash && !force) return false;

    // Authoritative check against Signed Manifest
    const goldenHash = this.manifest?.sidecars?.[name]?.hash || Deno.env.get(`CTS_HASH_${name.toUpperCase()}`);
    
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
        // OPTIMIZATION: Use Deno.readFile to get a Uint8Array which Web Crypto digest() expects.
        // For very large files, we could use a custom streaming implementation, but for
        // agent binaries (typically < 20MB), a single read is efficient and avoids process spawn overhead.
        const data = await Deno.readFile(path);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:infra:runtime:sidecar_manager:hash",
            message: `Native hashing failed for ${path}: ${(e as any).message}. Falling back to sha256sum.`
        });

        try {
            const result = await this.executor.execute("sha256sum", [path]);
            if (result.success && result.stdout) {
                return result.stdout.split(" ")[0].trim();
            }
        } catch { /* ignore */ }
        return null;
    }
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
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: `Restarting sidecar ${name} (attempt ${restartInfo.count}/3)`
      });
      setTimeout(() => {
        this.getPersistentSidecar(name).catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:sidecar_manager:auto_restart",
                message: `Auto-restart failed for ${name}: ${(e as Error).message}`
            });
        });
      }, Math.pow(2, restartInfo.count - 1) * 1000);
    } else {
      const msg = `Sidecar ${name} failed too many times. Giving up.`;
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:infra:runtime:sidecar_manager",
          message: msg
      });
      this.emitEvent("SYSTEM_ERROR", { type: "SIDECAR_CRASH_LOOP", sidecar: name, message: msg });
    }
  }
}
