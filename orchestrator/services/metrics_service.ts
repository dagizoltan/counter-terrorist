import { FirewallManager } from "../protection/firewall.ts";
import { MeshManager } from "./mesh.ts";
import { HoneypotService } from "./honeypot_service.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { BroadcastFunction } from "../plugins/types.ts";

export class MetricsService {
    constructor(
        private firewall: FirewallManager,
        private mesh: MeshManager,
        private honeypot: HoneypotService,
        private processTracker: ProcessTracker,
        private broadcast: BroadcastFunction
    ) {
        this.start();
    }

    private start() {
        setInterval(() => this.collectAndBroadcast(), 2000);
    }

    private async collectAndBroadcast() {
        const firewallStatus = await this.firewall.getStatus();
        const meshNodes = this.mesh.getNodes();
        const honeypotModules = this.honeypot.getModules();
        
        const metrics = {
            firewall: {
                blockedCount: (firewallStatus.stdout.match(/REJECT/g) || []).length, // Heuristic if using iptables
                rules: firewallStatus.stdout.split('\n').length
            },
            mesh: {
                activeNodes: meshNodes.length,
                totalNodes: meshNodes.length // In a real cluster, this might be more
            },
            honeypot: {
                activeDecoys: honeypotModules.filter(m => m.active).length,
                totalHits: this.honeypot.getHitCount()
            },
            forensics: {
                processCount: this.processTracker.getTree().length
            }
        };

        this.broadcast({
            type: "METRICS_UPDATE",
            data: metrics
        });
    }
}
