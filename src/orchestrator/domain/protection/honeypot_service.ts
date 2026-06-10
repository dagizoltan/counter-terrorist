import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType, CommandPort, FirewallPort, PcapPort, EventBusPort } from "@core/ports.ts";
import { SystemEvent } from "@domain/analysis/events.ts";
import { Result, ok, err } from "@core/result.ts";
import { secureRandomInt, secureRandomBool } from "../../core/crypto_utils.ts";

export interface HoneypotModule {
  id: string;
  name: string;
  port: number;
  description: string;
  active: boolean;
}

export class HoneypotService extends BaseService {
  private modules: Map<string, HoneypotModule> = new Map();
  private eventHandlers: ((event: SystemEvent) => void)[] = [];
  private hitCount: number = 0;

  constructor(
    private sidecarManager: CommandPort,
    private firewall: FirewallPort,
    private pcap: PcapPort,
    private logging: LoggingPort
  ) {
    // Register default modules
    super();
    this.registerModule({
      id: "ssh",
      name: "SSH Decoy",
      port: 22,
      description: "Emulates an OpenSSH 8.2 server to capture brute-force attempts.",
      active: true,
    });
    this.registerModule({
      id: "redis",
      name: "Redis Decoy",
      port: 6379,
      description: "Emulates an unauthenticated Redis instance to detect RCE attempts.",
      active: false,
    });
    this.registerModule({
      id: "http",
      name: "Web Admin Decoy",
      port: 80,
      description: "Fake administration panel to detect web crawlers and exploit attempts.",
      active: true,
    });
    this.registerModule({
      id: "postgresql",
      name: "PostgreSQL Decoy",
      port: 5432,
      description: "Emulates an exposed PostgreSQL instance to capture credential brute-force.",
      active: true,
    });
    this.registerModule({
      id: "rdp",
      name: "RDP Decoy",
      port: 3389,
      description: "Fake Remote Desktop service to detect lateral movement attempts.",
      active: true,
    });
    this.registerModule({
      id: "vault",
      name: "HashiCorp Vault Decoy",
      port: 8200,
      description: "Fake Vault API to detect credential and secret theft attempts.",
      active: true,
    });
  }

  onEvent(handler: (event: SystemEvent) => void) {
    this.eventHandlers.push(handler);
  }

  private emitEvent(event: unknown) {
    for (const handler of this.eventHandlers) {
      handler(event as SystemEvent);
    }
  }

  registerModule(module: HoneypotModule) {
    this.modules.set(module.id, module);
  }

  getModules(): HoneypotModule[] {
    return Array.from(this.modules.values());
  }

  getModule(id: string): HoneypotModule | undefined {
    return this.modules.get(id);
  }

  async toggleModule(id: string, active: boolean): Promise<Result<void>> {
    const module = this.modules.get(id);
    if (module) {
      module.active = active;
      if (active) {
        await this.firewall.allowPort(module.port, "tcp");
      } else {
        await this.firewall.denyPort(module.port, "tcp");
      }
      const res = await this.sidecarManager.sendCommand("decoy", {
        type: "ToggleModule",
        module: id, 
        active, 
        port: module.port
      });
      if (!res.success) return err(new Error(`Failed to toggle decoy module: ${res.stderr}`));
      return ok(undefined);
    }
    return err(new Error(`Module ${id} not found`));
  }

  private morphInterval?: any;
  private metricsInterval?: any;

  protected override async onInit(): Promise<Result<void>> {
    const res = await this.start();
    return res;
  }

  async start(): Promise<Result<void>> {
    const sidecar = await this.sidecarManager.getPersistentSidecar("decoy");
    if (!sidecar) {
        const msg = "Failed to initialize 'decoy' sidecar. Honeypot service remains dormant.";
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:honeypot",
            message: msg
        });
        return err(new Error(msg));
    }

    this.sidecarManager.onEvent("decoy", (event) => this.handleEvent(event));

    // Initialize firewall rules and sidecar modules for active modules
    for (const module of this.modules.values()) {
        if (module.active) {
            await this.toggleModule(module.id, true);
        }
    }

    // Phase 3: Deception Morphing - Periodically rotate decoy ports
    this.morphInterval = setInterval(() => {
        this.morph().catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:honeypot:morph",
                message: `Periodic morphing failed: ${e.message}`
            });
        });
    }, 600000); // Every 10 minutes
    this.metricsInterval = setInterval(() => this.emitMetrics(), 30000);
    return ok(undefined);
  }

  override setEventBus(eventBus: EventBusPort) {
    this.eventBus = eventBus;
  }

  private async emitMetrics() {
    if (!this.eventBus) return;
    await this.eventBus.emit("METRIC_UPDATE", {
      domain: "honeypot",
      data: {
        activeDecoys: Array.from(this.modules.values()).filter(m => m.active).length,
        totalHits: this.hitCount
      }
    });
  }

  protected override async onShutdown(): Promise<Result<void>> {
      if (this.morphInterval) {
          clearInterval(this.morphInterval);
          this.morphInterval = undefined;
      }
      if (this.metricsInterval) {
          clearInterval(this.metricsInterval);
          this.metricsInterval = undefined;
      }
      await this.sidecarManager.stopSidecar("decoy");
      return ok(undefined);
  }

  private async handleEvent(event: unknown) {
    if (!event || typeof event !== "object") return;
    const payload = (event as { data?: unknown }).data as Record<string, unknown> | undefined;
    if (!payload) return;

    if (payload.type === "PortAccess") {
      const source_ip = typeof payload.source_ip === "string" ? payload.source_ip : typeof payload.ip === "string" ? payload.ip : "unknown";
      const port = typeof payload.port === "number" || typeof payload.port === "string" ? payload.port : "unknown";
      const module = Array.from(this.modules.values()).find(m => m.port === Number(port));
      const callerId = module ? `decoy:${module.id}` : "decoy:unknown";

      this.hitCount++;
      this.emitEvent({ type: "PortAccess", source_ip, port });

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: callerId,
          message: `Tactical Trigger: Port ${port} access from ${source_ip}`,
          payload: { source_ip, port, hitCount: this.hitCount, module: module?.name }
      });

      if (this.eventBus) await this.eventBus.emit("UI_BROADCAST", {
        type: "TACTICAL_TRIGGER",
        data: {
          type: "HONEYPOT_HIT",
          severity: LogSeverity.WARNING,
          caller: callerId,
          message: `Honeypot Triggered: Access to Port ${port} from ${source_ip}`,
          payload: { source_ip, port }
        }
      });

      // DECOUPLING: Emit pure event for cross-domain orchestration
      if (this.eventBus) {
        await this.eventBus.emit("HONEYPOT", {
            type: "PortAccess",
            source_ip,
            port,
            module: module?.id
        });
      } else {
        // Fallback for standalone/minimal mode
        this.firewall.shadowBanIp(source_ip).catch(e => this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "honeypot",
            message: `Shadow ban failed for ${source_ip}: ${e.message}`
        }));
        this.sabotageSession(source_ip).catch(() => {});
      }

      // Automated Forensics: Start capture for the attacker's traffic
      const safeIp = source_ip.replace(/[\.:]/g, '_');
      try {
        await this.pcap.startCapture("any", 300, `honeypot_hit_${safeIp}_${Date.now()}.pcap`, `host ${source_ip}`);
      } catch (err) {
        this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "orchestrator:domain:protection:honeypot_service",
          message: `Honeypot forensic capture failed for ${source_ip}: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    } else if (payload.type === "SessionData") {
      const { port, source_ip, data: rawData } = payload;

      // SEC-05: Unbounded Session Transcript Protection
      // Implement hard byte-limits (16KB) for captured session data to prevent memory exhaustion (OOM).
      const MAX_SESSION_BYTES = 16384;
      const dataStr = String(rawData);
      const data = dataStr.length > MAX_SESSION_BYTES
        ? dataStr.substring(0, MAX_SESSION_BYTES) + "... [TRUNCATED]"
        : dataStr;

      const module = Array.from(this.modules.values()).find(m => m.port === Number(port));
      const callerId = module ? `decoy:${module.id}` : "decoy:session";

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.DEBUG,
          severity: LogSeverity.INFO,
          caller: callerId,
          message: `Session transcript from ${source_ip}:${port}`,
          payload: { source_ip, port, data }
      });
      
      // Store session data in the audit chain for behavioral modeling
      this.emitEvent({ type: "SessionData", source_ip, port, data });
    }
  }

  /**
   * High-confidence trigger from the Web Ingress decoy routes.
   */
  async onWebTrigger(route: string, source_ip: string): Promise<Result<void>> {
    this.hitCount++;
    this.emitEvent({ type: "WebAccess", source_ip, route });

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:protection:honeypot:http",
        message: `Web Decoy Triggered: Path '${route}' from ${source_ip}`,
        payload: { source_ip, route, hitCount: this.hitCount }
    });

    if (this.eventBus) await this.eventBus.emit("UI_BROADCAST", {
      type: "TACTICAL_TRIGGER",
      data: {
        type: "WEB_DECOY_HIT",
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:protection:honeypot:http",
        message: `Web Decoy Triggered: Access to ${route} from ${source_ip}`,
        payload: { source_ip, route }
      }
    });

    // Immediate blocking for web decoys as they are 100% malicious
    await this.firewall.blockIp(source_ip);

    // Automated Forensics: Start capture for the attacker's traffic
    const safeIp = source_ip.replace(/[\.:]/g, '_');
    await this.pcap.startCapture("any", 300, `web_decoy_${safeIp}_${Date.now()}.pcap`, `host ${source_ip}`);

    // Active Sabotage: Initiate Breaker protocol on the attacker's session
    return await this.sabotageSession(source_ip);
  }

  /**
   * Initiates the 'Breaker' protocol to sabotage an attacker's session.
   * Injects latency, jitter, and fake errors to frustrate the adversary.
   */
  async sabotageSession(source_ip: string, level: string = "HIGH"): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:protection:honeypot:breaker",
        message: `Initiating Breaker Protocol against ${source_ip} (Level: ${level})`
    });

    // Adaptive Sabotage Strategies
    let mode = "JITTER";
    let latency_ms = 2000;

    if (level === "CRITICAL") {
        mode = "DYNAMIC";
        latency_ms = 5000;
    } else if (secureRandomBool()) {
        mode = "ERRORS";
    }
    
    // We send a Sabotage command to the honeypot sidecar
    // The sidecar will then inject jitter and errors for this specific IP
    const res = await this.sidecarManager.sendCommand("decoy", {
        type: "Sabotage",
        source_ip, 
        level,
        mode,
        latency_ms
    });
    if (!res.success) return err(new Error(`Sabotage command failed: ${res.stderr}`));
    return ok(undefined);
  }

  /**
   * Randomly rotates the ports of all active modules to confuse attackers.
   */
  async morph(): Promise<Result<void>> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:protection:honeypot:system",
        message: "Engaging Deception Morphing (Port Rotation)..."
    });

    const activeModules = Array.from(this.modules.entries()).filter(([_, m]) => m.active);

    for (const [id, module] of activeModules) {
      if (!module.active) continue;

      const oldPort = module.port;
      let newPort: number;
      const protectedPorts = [8000, 8001, 8002]; // Orchestrator ports
      
      let portAvailable = false;
      let attempts = 0;
      const MAX_PORT_SELECTION_ATTEMPTS = 50;

      do {
        attempts++;
        // Preference for common but usually unused ports for better camouflage
        const camouflagePorts = [111, 515, 1024, 2049, 4000, 5000, 9000];
        const useCamouflage = secureRandomBool();
        if (useCamouflage) {
           newPort = camouflagePorts[secureRandomInt(0, camouflagePorts.length - 1)];
        } else {
           newPort = secureRandomInt(1024, 65535);
        }

        if (!protectedPorts.includes(newPort) && !Array.from(this.modules.values()).some(m => m.port === newPort)) {
            // Verify port is not in use by other system services
            const res = await this.sidecarManager.getExecutor().execute("ss", ["-Hlnt", `sport = :${newPort}`]);
            if (res.success && res.stdout.trim() === "") {
                portAvailable = true;
            }
        }

        if (attempts >= MAX_PORT_SELECTION_ATTEMPTS) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:honeypot:morph",
                message: `MORPHING STABILITY ALERT: Failed to find an available port for module ${id} after ${attempts} attempts. Skipping rotation.`
            });
            break;
        }
      } while (!portAvailable);

      if (!portAvailable) continue;

      // Port morphing race condition
      // Update sidecar BEFORE opening firewall to ensure listener is ready
      // We explicitly AWAIT the successful binding in the sidecar before modifying infrastructure
      const updateRes = await this.sidecarManager.sendCommand("decoy", {
        type: "UpdateModule",
        module: id, 
        old_port: oldPort,
        new_port: newPort
      });

      if (updateRes.success) {
          // ENSURE ATOMICITY: Apply new firewall rule before removing old one to prevent connection drops,
          // but only after the decoy sidecar has confirmed it is listening.
          const allowRes = await this.firewall.allowPort(newPort, "tcp");
          if (allowRes.success) {
              module.port = newPort;
              const denyRes = await this.firewall.denyPort(oldPort, "tcp");
              if (!denyRes.success) {
                  this.logging.log({
                      timestamp: new Date().toISOString(),
                      type: LogType.AUDIT,
                      severity: LogSeverity.WARNING,
                      caller: `decoy:${id}`,
                      message: `DECEPTION MORPH WARNING: Failed to close old port ${oldPort} after rotation.`
                  });
              }
          } else {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.AUDIT,
                  severity: LogSeverity.ERROR,
                  caller: `decoy:${id}`,
                  message: `DECEPTION MORPH FAILED: Firewall refused to open new port ${newPort}`
              });
              // Attempt to rollback sidecar to old port if possible
              await this.sidecarManager.sendCommand("decoy", {
                type: "UpdateModule",
                module: id,
                old_port: newPort,
                new_port: oldPort
              });
              continue;
          }
      } else {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: `decoy:${id}`,
              message: `DECEPTION MORPH FAILED: Sidecar refused port update from ${oldPort} to ${newPort}`
          });
          continue;
      }

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: `decoy:${id}`,
          message: `DECEPTION MORPH: ${module.name} port rotation from ${oldPort} to ${newPort}`
      });

      if (this.eventBus) await this.eventBus.emit("UI_BROADCAST", {
        type: "AUDIT_EVENT",
        data: {
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: `decoy:${id}`,
          message: `DECEPTION MORPH: ${module.name} port rotation from ${oldPort} to ${newPort}`,
          data: { id, oldPort, newPort }
        }
      });
    }

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:domain:protection:honeypot:system",
        message: "Deception Morphing cycle completed successfully."
    });
    return ok(undefined);
  }

  getDecoyRoutes(): string[] {
    return ["/admin", "/.git/config", "/wp-config.php", "/.env", "/config.json", "/aws_credentials", "/secrets.env"];
  }

  getHitCount(): number {
    return this.hitCount;
  }
}
