import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { MeshManager } from "../engine/mesh.ts";
import { HoneypotService, HoneypotModule } from "../protection/honeypot_service.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { KernelService } from "../protection/kernel_service.ts";
import { AuditService } from "./audit.ts";
import { CanaryService, CanaryToken } from "../protection/canary_service.ts";
import { BroadcastFunction } from "../engine/plugins/types.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { MeshNode } from "../engine/mesh.ts";
import { VpnPort } from "@core/ports.ts";
import { BehavioralService } from "./behavioral_service.ts";
import { GeoIpService } from "./geoip_service.ts";

export interface SystemMetrics {
    firewall: {
        blockedCount: number;
        rules: number;
        blockedIps: string[];
        suspiciousIps: any[];
    };
    mesh: {
        activeNodes: number;
        totalNodes: number;
        selfId: string;
    };
    honeypot: {
        activeDecoys: number;
        totalHits: number;
    };
    forensics: {
        processCount: number;
        ebpfActive: boolean;
        fimActive: boolean;
    };
    kernel: {
        aslr: string;
        syncookies: string;
        rp_filter: string;
        tcp_timestamps: string;
        accept_source_route: string;
        icmp_echo_ignore_broadcasts: string;
    };
    canary: {
        deployed: number;
        triggered: number;
    };
    audit: {
        chainVerified: boolean;
        totalEvents: number;
    };
    scanner: {
        lastScanTime: string;
        lastScanResult: string;
        available: boolean;
    };
    vpn: {
        active: boolean;
        interface: string;
        available: boolean;
        mode?: string;
    };
    geo: {
        topCountries: string[];
        totalOrigins: number;
    };
}

export class MetricsService {
    private lastScanTime: string = "NEVER";
    private lastScanResult: string = "PENDING";
    private cachedMetrics: SystemMetrics | null = null;

    constructor(
        private firewall: FirewallManager,
        private mesh: MeshManager,
        private honeypot: HoneypotService,
        private processTracker: ProcessTracker,
        private kernelService: KernelService,
        private auditService: AuditService,
        private canaryService: CanaryService,
        private sidecarManager: SidecarManager,
        private vpn: VpnPort,
        private behavioral: BehavioralService,
        private anonymization: any, // AnonymizationService
        private geoIp: GeoIpService,
        private broadcast: BroadcastFunction,
        private tacticalIntel?: any,
        private news?: any,
        private networkDiscovery?: any
    ) {
        this.start();
    }

    private start() {
        // Collect every 3 seconds
        setInterval(() => this.collectAndBroadcast(), 3000);
    }

    getLatest(): SystemMetrics | null {
        return this.cachedMetrics;
    }

    recordScan(time: string, result: string) {
        this.lastScanTime = time;
        this.lastScanResult = result;
    }

    private async collectAndBroadcast() {
        try {
            const firewallStatus = await this.firewall.getStatus();
            const meshNodes = this.mesh.getNodes();
            const honeypotModules = this.honeypot.getModules();
            const kernelStatus = await this.kernelService.getStatus();
            const canaryTokens = this.canaryService.getTokens();
            const auditVerification = await this.auditService.verifyChain(50);
            const recentEvents = await this.auditService.getRecentEvents(1);

            // Parse real firewall data
            const fwLines = firewallStatus.stdout?.split('\n').filter((l: string) => l.trim()) || [];
            const rejectCount = (firewallStatus.stdout?.match(/REJECT|DROP|DENY/g) || []).length;
            
            // Extract blocked IPs from iptables/ufw output
            const blockedIps: string[] = [];
            for (const line of fwLines) {
                const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
                if (ipMatch && (line.includes("DROP") || line.includes("REJECT") || line.includes("DENY"))) {
                    blockedIps.push(ipMatch[1]);
                }
            }

            // Check sidecar statuses
            const ebpfActive = this.sidecarManager.isRunning("ebpf");
            const fimActive = this.sidecarManager.isRunning("fim");

            const metrics: SystemMetrics = {
                firewall: {
                    blockedCount: rejectCount,
                    rules: fwLines.length,
                    blockedIps: [...new Set(blockedIps)].slice(0, 20),
                    suspiciousIps: this.behavioral.getSuspiciousIps().slice(0, 10),
                },
                mesh: {
                    activeNodes: meshNodes.filter((n: MeshNode) => Date.now() - n.lastSeen < 60000).length,
                    totalNodes: meshNodes.length,
                    selfId: Deno.hostname() || "local",
                },
                honeypot: {
                    activeDecoys: honeypotModules.filter((m: HoneypotModule) => m.active).length,
                    totalHits: this.honeypot.getHitCount()
                },
                forensics: {
                    processCount: this.processTracker.getTree().length,
                    ebpfActive,
                    fimActive,
                },
                kernel: {
                    aslr: kernelStatus.aslr,
                    syncookies: kernelStatus.syncookies,
                    rp_filter: kernelStatus.rp_filter,
                    tcp_timestamps: kernelStatus.tcp_timestamps,
                    accept_source_route: kernelStatus.accept_source_route,
                    icmp_echo_ignore_broadcasts: kernelStatus.icmp_echo_ignore_broadcasts,
                },
                canary: {
                    deployed: canaryTokens.length,
                    triggered: canaryTokens.filter((t: CanaryToken) => t.triggered).length,
                },
                audit: {
                    chainVerified: auditVerification.valid,
                    totalEvents: recentEvents.length > 0 ? recentEvents.length : 0,
                },
                scanner: {
                    lastScanTime: this.lastScanTime,
                    lastScanResult: this.lastScanResult,
                    available: (await this.sidecarManager.getExecutor().execute("which", ["clamscan"])).success
                },
                vpn: {
                    active: (await this.vpn.isConnected()) || (meshNodes.filter(n => n.verified && (Date.now() - n.lastSeen < 600000)).length > 0),
                    interface: (await this.vpn.isConnected()) ? "wg0" : "Sovereign Mesh (mTLS)",
                    available: (await this.sidecarManager.getExecutor().execute("which", ["wg"])).success || true,
                    mode: this.anonymization.getMode(),
                    telemetry: this.anonymization.getTelemetry()
                },
                geo: {
                    topCountries: Array.from(new Set(this.geoIp.getCache().map(c => c.country))).slice(0, 5),
                    totalOrigins: new Set(this.geoIp.getCache().map(c => c.country)).size
                },
                mesh: {
                    nodes: meshNodes.length,
                    verified: meshNodes.filter(n => n.verified).length,
                    quorum: meshNodes.filter(n => n.verified).length >= 1
                },
                node: {
                    ebpf: true,
                    shadowActive: false,
                    integrityScore: 100
                },
                tactical: {
                    recentThreats: await (async () => {
                        const threats = await this.tacticalIntel?.getRecentThreats(15) ?? [];
                        const blockedIps = await this.firewall.getBlockedIps();
                        return threats.map((t: any) => ({
                            ...t,
                            blocked: blockedIps.includes(t.indicator)
                        }));
                    })()
                },
                discovery: {
                    devices: this.networkDiscovery?.getDevices() ?? []
                },
                news: {
                    latest: await this.news?.getLatestSignals(5) ?? []
                }
            };

            this.cachedMetrics = metrics;

            this.broadcast({
                type: "METRICS_UPDATE",
                data: metrics
            });
        } catch (e) {
            // Don't crash the metrics loop
            console.error("[METRICS] Collection error:", (e as Error).message);
        }
    }
}

// Singleton for HTTP endpoint access
let _metricsInstance: MetricsService | null = null;

export function setMetricsService(instance: MetricsService) {
    _metricsInstance = instance;
}

export function getMetricsSnapshot(): SystemMetrics | null {
    return _metricsInstance?.getLatest() ?? null;
}

export function recordScannerResult(time: string, result: string) {
    if (_metricsInstance) {
        _metricsInstance.recordScan(time, result);
    }
}
