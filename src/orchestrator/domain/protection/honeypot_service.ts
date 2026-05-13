import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { BroadcastFunction } from "../orchestration/plugins/types.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { isValidIP } from "@infrastructure/system/validation.ts";

export interface HoneypotModule {
  id: string;
  name: string;
  port: number;
  description: string;
  active: boolean;
}

export interface HoneypotEvent {
  type: string;
  source_ip?: string;
  port?: string | number;
  data?: any;
  route?: string;
}

export interface IBehavioralService {
  analyze(ip: string): Promise<string>;
}

export class HoneypotService {
  private modules: Map<string, HoneypotModule> = new Map();
  private eventHandlers: ((event: HoneypotEvent) => void)[] = [];
  private hitCount: number = 0;
  private morphInterval?: number;

  constructor(
    private sidecarManager: SidecarManager,
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction,
    private logging: LoggingPort
  ) {
    // Register default modules
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

  onEvent(handler: (event: HoneypotEvent) => void) {
    this.eventHandlers.push(handler);
  }

  private emitEvent(event: HoneypotEvent) {
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
      }).catch(err => {
        this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "orchestrator:domain:protection:honeypot:toggle",
          message: `Failed to toggle decoy module ${id}: ${err instanceof Error ? err.message : String(err)}`
        }).catch(() => {});
      });
    }
  }

  async start() {
    await this.sidecarManager.getPersistentSidecar("decoy");
    this.sidecarManager.onEvent("decoy", (event) => this.handleEvent(event));

    // Initialize firewall rules and sidecar modules for active modules
    for (const module of this.modules.values()) {
        if (module.active) {
            await this.toggleModule(module.id, true).catch(err => {
              this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:honeypot:start",
                message: `Failed to start decoy module ${module.id}: ${err instanceof Error ? err.message : String(err)}`
              }).catch(() => {});
            });
        }
    }

    // Phase 3: Deception Morphing - Periodically rotate decoy ports
    this.morphInterval = setInterval(() => this.morph(), 600000); // Every 10 minutes
  }

  public stop() {
    if (this.morphInterval) {
        clearInterval(this.morphInterval);
        this.morphInterval = undefined;
    }
  }

  private behavioralService?: IBehavioralService; 

  setBehavioralService(service: IBehavioralService) {
    this.behavioralService = service;
  }

  private async handleEvent(event: { data?: any }) {
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

      this.broadcast({
        type: "TACTICAL_TRIGGER",
        data: {
          type: "HONEYPOT_HIT",
          severity: LogSeverity.WARNING,
          caller: callerId,
          message: `Honeypot Triggered: Access to Port ${port} from ${source_ip}`,
          payload: { source_ip, port }
        }
      });

      if (this.behavioralService) {
        await this.behavioralService.analyze(source_ip);
      } else {
        this.firewall.shadowBanIp(source_ip).catch(err => 
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "DECEPTION",
                message: `ShadowBan failed for ${source_ip}: ${err.message}`
            })
        );
        this.sabotageSession(source_ip);
      }

      // Automated Forensics: Start capture for the attacker's traffic
      // SEC-06: Validate IP before injecting into BPF filter to prevent filter injection
      if (isValidIP(source_ip)) {
        const safeIp = source_ip.replace(/[\.:]/g, '_');
        this.pcap.startCapture("any", 300, `honeypot_hit_${safeIp}_${Date.now()}.pcap`, `host ${source_ip}`).catch(err => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:honeypot:pcap",
                message: `Failed to start PCAP for honeypot hit on ${source_ip}: ${err instanceof Error ? err.message : String(err)}`
            }).catch(() => {});
        });
      }
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

    this.broadcast({
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
    this.firewall.blockIp(source_ip).catch(err => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:honeypot:web",
            message: `Failed to block IP ${source_ip} after web trigger: ${err instanceof Error ? err.message : String(err)}`
        }).catch(() => {});
    });

    // Automated Forensics: Start capture for the attacker's traffic
    // SEC-06: Validate IP before injecting into BPF filter to prevent filter injection
    if (isValidIP(source_ip)) {
      const safeIp = source_ip.replace(/[\.:]/g, '_');
      this.pcap.startCapture("any", 300, `web_decoy_${safeIp}_${Date.now()}.pcap`, `host ${source_ip}`).catch(err => {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "orchestrator:domain:protection:honeypot:pcap",
              message: `Failed to start PCAP for web decoy hit on ${source_ip}: ${err instanceof Error ? err.message : String(err)}`
          }).catch(() => {});
      });
    }

    // Active Sabotage: Initiate Breaker protocol on the attacker's session
    this.sabotageSession(source_ip);
  }

  /**
   * Initiates the 'Breaker' protocol to sabotage an attacker's session.
   * Injects latency, jitter, and fake errors to frustrate the adversary.
   */
  async sabotageSession(source_ip: string) {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:domain:protection:honeypot:breaker",
        message: `Initiating Breaker Protocol against ${source_ip}`
    });
    
    // We send a Sabotage command to the honeypot sidecar
    // The sidecar will then inject jitter and errors for this specific IP
    await this.sidecarManager.sendCommand("decoy", {
        type: "Sabotage",
        source_ip, 
        level: "HIGH"
    }).catch(err => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:honeypot:breaker",
            message: `Failed to send sabotage command to sidecar for ${source_ip}: ${err instanceof Error ? err.message : String(err)}`
        }).catch(() => {});
    });
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

    for (const [id, module] of this.modules) {
      if (!module.active) continue;

      const oldPort = module.port;
      let newPort: number;
      const protectedPorts = [8000, 8001, 8002]; // Orchestrator ports
      
      let morphAttempts = 0;
      do {
        // Preference for common but usually unused ports for better camouflage
        const camouflagePorts = [111, 515, 1024, 2049, 4000, 5000, 9000];
        const useCamouflage = Math.random() > 0.5;
        if (useCamouflage) {
           newPort = camouflagePorts[Math.floor(Math.random() * camouflagePorts.length)];
        } else {
           newPort = Math.floor(Math.random() * (65535 - 1024) + 1024);
        }
        morphAttempts++;
        // PERF-05: Prevent infinite loop if all ports are occupied
        if (morphAttempts > 100) {
          newPort = oldPort; // Fall back to keeping the existing port
          break;
        }
      } while (protectedPorts.includes(newPort) || Array.from(this.modules.values()).some(m => m.port === newPort));

      module.port = newPort;

      await this.firewall.denyPort(oldPort, "tcp");
      await this.firewall.allowPort(newPort, "tcp");

      await this.sidecarManager.sendCommand("decoy", {
        type: "UpdateModule",
        module: id, 
        oldPort, 
        newPort
      }).catch(err => {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:honeypot:morph",
            message: `Failed to update decoy module ${id} port rotation from ${oldPort} to ${newPort}: ${err instanceof Error ? err.message : String(err)}`
        }).catch(() => {});
      });

      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.INFO,
          caller: `decoy:${id}`,
          message: `DECEPTION MORPH: ${module.name} port rotation from ${oldPort} to ${newPort}`
      });

      this.broadcast({
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
