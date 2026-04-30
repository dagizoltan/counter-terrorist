import { SidecarManager } from "../infrastructure/sidecar_manager.ts";
import { FirewallManager } from "../protection/firewall.ts";
import { PcapManager } from "../protection/pcap.ts";
import { BroadcastFunction } from "../plugins/types.ts";

export interface HoneypotModule {
  id: string;
  name: string;
  port: number;
  description: string;
  active: boolean;
}

export class HoneypotService {
  private modules: Map<string, HoneypotModule> = new Map();
  private eventHandlers: ((event: any) => void)[] = [];
  private hitCount: number = 0;

  constructor(
    private sidecarManager: SidecarManager,
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction
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
      id: "telnet",
      name: "Legacy Telnet",
      port: 23,
      description: "Detects legacy IoT botnets searching for open telnet ports.",
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
      await this.sidecarManager.sendCommand("honeypot", {
        type: "ToggleModule",
        payload: { module: id, active, port: module.port }
      });
    }
  }

  async start() {
    await this.sidecarManager.getPersistentSidecar("honeypot");
    this.sidecarManager.onEvent("honeypot", (event) => this.handleEvent(event));
  }

  private handleEvent(event: any) {
    if (event.event?.type === "PortAccess") {
      const payload = event.event.payload;
      const { port, source_ip } = payload;
      
      this.hitCount++;
      this.emitEvent({ type: "PortAccess", source_ip, port });

      this.broadcast({
        type: "CRITICAL",
        message: `Honeypot Triggered: Access to ${port} from ${source_ip}`,
        data: { source_ip, port }
      });
      this.firewall.blockIp(source_ip).catch(console.error);
    }
  }

  getHitCount() {
    return this.hitCount;
  }
}
