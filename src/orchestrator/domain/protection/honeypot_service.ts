import { BaseService } from "@core/base_service.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { BroadcastFunction } from "../orchestration/plugins/types.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export interface HoneypotModule {
  id: string;
  name: string;
  port: number;
  description: string;
  active: boolean;
}

export class HoneypotService extends BaseService {
  private modules: Map<string, HoneypotModule> = new Map();
  private eventHandlers: ((event: any) => void)[] = [];
  private hitCount: number = 0;
  private eventBus?: any;

  constructor(
    private sidecarManager: SidecarManager,
    private firewall: FirewallManager,
    private pcap: PcapManager,
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

  onEvent(handler: (event: any) => void) {
    this.eventHandlers.push(handler);
  }

  private emitEvent(event: any) {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  registerModule(module: HoneypotModule) {
    this.modules.set(module.id, module);
  }

  getModules() {
    return Array.from(this.modules.values());
  }

  getModule(id: string) {
    return this.modules.get(id);
  }

  async toggleModule(id: string, active: boolean) {
    const module = this.modules.get(id);
    if (module) {
      module.active = active;
      if (active) {
        await this.firewall.allowPort(module.port, "tcp");
      } else {
        await this.firewall.denyPort(module.port, "tcp");
      }
      await this.sidecarManager.sendCommand("decoy", {
        type: "ToggleModule",
        module: id, 
        active, 
        port: module.port
      }).catch(() => {});
    }
  }

  private morphInterval?: number;

  async start() {
    const sidecar = await this.sidecarManager.getPersistentSidecar("decoy");
    if (!sidecar) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:honeypot",
            message: "Failed to initialize 'decoy' sidecar. Honeypot service remains dormant."
        });
        return;
    }

    this.sidecarManager.onEvent("decoy", (event) => this.handleEvent(event));

    // Initialize firewall rules and sidecar modules for active modules
    for (const module of this.modules.values()) {
        if (module.active) {
            await this.toggleModule(module.id, true).catch(() => {});
        }
    }

    // Phase 3: Deception Morphing - Periodically rotate decoy ports
    this.morphInterval = setInterval(() => this.morph(), 600000); // Every 10 minutes
    setInterval(() => this.emitMetrics(), 30000);
  }

  setEventBus(eventBus: any) {
    this.eventBus = eventBus;
  }

  private emitMetrics() {
    if (!this.eventBus) return;
    this.eventBus.emit("METRIC_UPDATE", {
      domain: "honeypot",
      data: {
        activeDecoys: Array.from(this.modules.values()).filter(m => m.active).length,
        totalHits: this.hitCount
      }
    });
  }

  shutdown() {
      if (this.morphInterval) {
          clearInterval(this.morphInterval);
          this.morphInterval = undefined;
      }
      this.sidecarManager.stopSidecar("decoy").catch(() => {});
  }

  private async handleEvent(event: any) {
    const payload = event.data;
    if (!payload) return;

    if (payload.type === "PortAccess") {
      const source_ip = payload.source_ip || payload.ip || "unknown";
      const port = payload.port || "unknown";
      
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

      if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
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
        this.eventBus.emit("HONEYPOT", {
            type: "PortAccess",
            source_ip,
            port,
            module: module?.id
        });
      } else {
        // Fallback for standalone/minimal mode
        this.firewall.shadowBanIp(source_ip).catch(() => {});
        this.sabotageSession(source_ip);
      }

      // Automated Forensics: Start capture for the attacker's traffic
      const safeIp = source_ip.replace(/[\.:]/g, '_');
      this.pcap.startCapture("any", 300, `honeypot_hit_${safeIp}_${Date.now()}.pcap`, `host ${source_ip}`).catch(console.error);
    } else if (payload.type === "SessionData") {
      const { port, source_ip, data } = payload;
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
  async onWebTrigger(route: string, source_ip: string) {
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

    if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
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
    this.firewall.blockIp(source_ip).catch(console.error);

    // Automated Forensics: Start capture for the attacker's traffic
    const safeIp = source_ip.replace(/[\.:]/g, '_');
    this.pcap.startCapture("any", 300, `web_decoy_${safeIp}_${Date.now()}.pcap`, `host ${source_ip}`).catch(console.error);

    // Active Sabotage: Initiate Breaker protocol on the attacker's session
    this.sabotageSession(source_ip);
  }

  /**
   * Initiates the 'Breaker' protocol to sabotage an attacker's session.
   * Injects latency, jitter, and fake errors to frustrate the adversary.
   */
  async sabotageSession(source_ip: string, level: string = "HIGH") {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:protection:honeypot:breaker",
        message: `Initiating Breaker Protocol against ${source_ip} (Level: ${level})`
    });

    // SOV-P2: Adaptive Sabotage Strategies
    let mode = "JITTER";
    let latency_ms = 2000;

    if (level === "CRITICAL") {
        mode = "DYNAMIC";
        latency_ms = 5000;
    } else if (Math.random() > 0.5) {
        mode = "ERRORS";
    }
    
    // We send a Sabotage command to the honeypot sidecar
    // The sidecar will then inject jitter and errors for this specific IP
    await this.sidecarManager.sendCommand("decoy", {
        type: "Sabotage",
        source_ip, 
        level,
        mode,
        latency_ms
    }).catch(() => {});
  }

  /**
   * Randomly rotates the ports of all active modules to confuse attackers.
   */
  async morph() {
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
      do {
        // Preference for common but usually unused ports for better camouflage
        const camouflagePorts = [111, 515, 1024, 2049, 4000, 5000, 9000];
        const useCamouflage = Math.random() > 0.5;
        if (useCamouflage) {
           newPort = camouflagePorts[Math.floor(Math.random() * camouflagePorts.length)];
        } else {
           newPort = Math.floor(Math.random() * (65535 - 1024) + 1024);
        }

        if (!protectedPorts.includes(newPort) && !Array.from(this.modules.values()).some(m => m.port === newPort)) {
            // BUG-04: Verify port is not in use by other system services
            const res = await this.sidecarManager.getExecutor().execute("ss", ["-Hlnt", `sport = :${newPort}`]);
            if (res.success && res.stdout.trim() === "") {
                portAvailable = true;
            }
        }
      } while (!portAvailable);

      // BUG-4.1 FIX: Port morphing race condition
      // Update sidecar BEFORE opening firewall to ensure listener is ready
      const updateRes = await this.sidecarManager.sendCommand("decoy", {
        type: "UpdateModule",
        module: id, 
        old_port: oldPort,
        new_port: newPort
      }).catch(() => ({ success: false }));

      if (updateRes.success) {
          module.port = newPort;
          await this.firewall.denyPort(oldPort, "tcp");
          await this.firewall.allowPort(newPort, "tcp");
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

      if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
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
  }

  getDecoyRoutes() {
    return ["/admin", "/.git/config", "/wp-config.php", "/.env", "/config.json", "/aws_credentials", "/secrets.env"];
  }

  getHitCount() {
    return this.hitCount;
  }
}
