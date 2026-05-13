import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { HoneypotService, HoneypotModule } from "../protection/honeypot_service.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { KernelService } from "../protection/kernel_service.ts";
import { AuditService } from "./audit.ts";
import { CanaryService, CanaryToken } from "../protection/canary_service.ts";
import { BroadcastFunction } from "../orchestration/plugins/types.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { MeshNode } from "../orchestration/mesh.ts";
import { VpnPort, LogSeverity, LogType } from "@core/ports.ts";
import { BehavioralService } from "./behavioral_service.ts";
import { GeoIpService } from "./geoip_service.ts";
import { TACTICAL_CONSTANTS } from "../../core/constants.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { 
    AnonymizationService, 
    TacticalIntelService, 
    NewsSignalService, 
    NetworkDiscoveryService, 
    AutopilotService, 
    HealthService, 
    SupplyChainService 
} from "../index.ts";

export interface SystemMetrics {
    firewall: {
        blockedCount: number;
        rules: number;
        blockedIps: string[];
        suspiciousIps: string[];
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
        hardwareVerified: boolean;
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
    node: {
        memory: { used: number; total: number; percent: number };
        cpu: { load: number };
        uptime: string;
        ebpf: boolean;
        integrityScore: number;
    };
    health: {
        severity: string;
        subsystems: { name: string; status: string; error?: string }[];
    };
    tactical: {
        recentThreats: { indicator: string; type: string; blocked: boolean }[];
        stats: Record<string, number>;
    };
    discovery: {
        devices: { ip: string; hostname?: string; lastSeen: string }[];
    };
    news: {
        latest: { title: string; severity: string; link?: string }[];
    };
    policy: {
        version: string;
        mode: string;
        remediations: number;
    };
    supplyChain: {
        name: string;
        version: string;
        license: string;
        status: string;
        feature: string;
        cve?: string;
    }[];
}

export class MetricsService {
    private lastScanTime: string = "NEVER";
    private lastScanResult: string = "PENDING";
    private cachedMetrics: SystemMetrics | null = null;
    private isCollecting: boolean = false;
    private scannerAvailable: boolean | null = null;
    private vpnAvailable: boolean | null = null;
    private collectionCount: number = 0;
    
    private readonly STAGGER_AUDIT = TACTICAL_CONSTANTS.METRICS.STAGGER_AUDIT_CYCLES;
    private readonly STAGGER_KERNEL = TACTICAL_CONSTANTS.METRICS.STAGGER_KERNEL_CYCLES;
    private readonly COLLECTION_INTERVAL_MS = TACTICAL_CONSTANTS.METRICS.COLLECTION_INTERVAL_MS;

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
        private anonymization: AnonymizationService,
        private geoIp: GeoIpService,
        private broadcast: BroadcastFunction,
        private tacticalIntel?: TacticalIntelService,
        private news?: NewsSignalService,
        private networkDiscovery?: NetworkDiscoveryService,
        private autopilot?: AutopilotService,
        private healthService?: HealthService,
        private supplyChain?: SupplyChainService
    ) {
        setMetricsService(this);
        this.start();
    }

    private isRunning = false;

    private async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // PERF-01: Perform Full Verification Cycle in background to not block boot
        setTimeout(async () => {
            try {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:analysis:metrics",
                    message: "Starting Full Forensic Integrity Verification of audit ledger (Background)..."
                });
                const verification = await this.auditService.verifyFullChain();
            if (!verification.valid) {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:analysis:metrics",
                    message: `FORENSIC CHAIN BREACH DETECTED at event ${verification.brokenAt?.eventId}. Type: ${verification.brokenAt?.type}`
                });
                // Broadcast immediate alert to UI
                this.broadcast({
                    type: "ALERT",
                    subType: "INTEGRITY_BREACH",
                    data: verification
                });
            } else {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "orchestrator:domain:analysis:metrics",
                    message: `Full ledger verification successful. ${verification.eventsChecked} links verified.`
                });
            }
        } catch (e) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:metrics",
                message: `Initial audit verification failed: ${(e as Error).message}`
            });
        }
        
        while (this.isRunning) {
            try {
                await this.collectAndBroadcast();
            } catch (e) {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:analysis:metrics",
                    message: `Collection cycle failed: ${e instanceof Error ? e.message : String(e)}`
                });
            }
            await new Promise(resolve => setTimeout(resolve, this.COLLECTION_INTERVAL_MS));
        }
    }

    public stop() {
        this.isRunning = false;
    }

    getLatest(): SystemMetrics | null {
        return this.cachedMetrics;
    }

    recordScan(time: string, result: string) {
        this.lastScanTime = time;
        this.lastScanResult = result;
    }

    private async collectAndBroadcast() {
        if (this.isCollecting) return;
        this.isCollecting = true;
        this.collectionCount++;

        try {
            // 1. Detection Phase (Run once)
            if (this.scannerAvailable === null) {
                this.scannerAvailable = this.sidecarManager.isRunning("analyzer");
                this.vpnAvailable = this.sidecarManager.isRunning("tunnel") || (await this.sidecarManager.getExecutor().execute("which", ["wg"])).success;
            }

            // 2. High-Frequency Phase (Parallelized for Performance)
            const [firewallStatus, meshNodes, blockedIps, vpnConnected] = await Promise.all([
                this.firewall.getStatus(),
                Promise.resolve(this.mesh.getNodes()),
                (this.firewall as any).getBlockedIps ? (this.firewall as any).getBlockedIps() : Promise.resolve([]),
                this.vpn.isConnected()
            ]);

            const honeypotModules = this.honeypot.getModules();
            const ebpfActive = this.sidecarManager.isRunning("sentinel");
            const fimActive = this.sidecarManager.isRunning("watchfile");

            const fwLines = firewallStatus.stdout?.split('\n').filter((l: string) => l.trim()) || [];
            const blockedIpsSet = new Set(blockedIps as string[]);

            // 3. Staggered Phase (Run less frequently)
            let auditStatus = { valid: true, count: 0 };
            if (this.collectionCount % this.STAGGER_AUDIT === 0) { 
                const verification = await this.auditService.verifyChain(20);
                const recent = await this.auditService.getRecentEvents(1);
                auditStatus = { valid: verification.valid, count: recent.length };
            } else if (this.cachedMetrics?.audit) {
                auditStatus = { 
                    valid: this.cachedMetrics.audit.chainVerified, 
                    count: this.cachedMetrics.audit.totalEvents 
                };
            }

            const kernelStatus = (this.collectionCount % this.STAGGER_KERNEL === 0) 
                ? await this.kernelService.getStatus() as any
                : (this.cachedMetrics?.kernel || { aslr: "2", syncookies: "1", rp_filter: "1" }) as any;

            const mem = Deno.memoryUsage();
            const metrics: SystemMetrics = {
                firewall: {
                    blockedCount: blockedIpsSet.size,
                    rules: fwLines.length,
                    blockedIps: Array.from(blockedIpsSet).slice(0, 20),
                    suspiciousIps: this.behavioral.getSuspiciousIps().slice(0, 10),
                },
                node: {
                    memory: {
                        used: mem.heapUsed,
                        total: mem.rss, // RSS is a better proxy for total OS memory used by process
                        percent: Math.floor((mem.heapUsed / mem.heapTotal) * 100)
                    },
                    cpu: {
                        load: Math.floor((Deno.loadavg()[0] || 0) * 100) / 100
                    },
                    uptime: "ACTIVE",
                    ebpf: ebpfActive,
                    integrityScore: auditStatus.valid ? 100 : 0,
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
                    tcp_timestamps: kernelStatus.tcp_timestamps || "1",
                    accept_source_route: kernelStatus.accept_source_route || "0",
                    icmp_echo_ignore_broadcasts: kernelStatus.icmp_echo_ignore_broadcasts || "1",
                },
                canary: {
                    deployed: this.canaryService.getTokens().length,
                    triggered: this.canaryService.getTokens().filter((t: CanaryToken) => t.triggered).length,
                },
                audit: {
                    chainVerified: auditStatus.valid,
                    totalEvents: auditStatus.count,
                    hardwareVerified: this.kernelService.getTpmManager?.()?.isHardwareVerified() || false,
                },
                scanner: {
                    lastScanTime: this.lastScanTime,
                    lastScanResult: this.lastScanResult,
                    available: !!this.scannerAvailable
                },
                vpn: {
                    active: vpnConnected || (meshNodes.filter(n => n.verified && (Date.now() - n.lastSeen < 600000)).length > 0),
                    interface: vpnConnected ? "wg0" : "Sovereign Mesh (mTLS)",
                    available: !!this.vpnAvailable,
                    mode: this.anonymization.getMode(),
                },
                geo: (() => {
                    const countries = new Set(Object.values(this.geoIp.getCache()).map(c => c.country));
                    return {
                        topCountries: Array.from(countries).slice(0, 5),
                        totalOrigins: countries.size
                    };
                })(),
                tactical: {
                    recentThreats: await (async () => {
                        const threats = await this.tacticalIntel?.getRecentThreats(10) ?? [];
                        return threats.slice(0, 10).map((t: {indicator: string; type: string}) => ({
                            ...t,
                            blocked: blockedIpsSet.has(t.indicator)
                        }));
                    })(),
                    stats: await this.tacticalIntel?.getStats() ?? {}
                },
                discovery: {
                    devices: (this.networkDiscovery?.getDevices() ?? []).map((d: {ip: string; hostname?: string; lastSeen: string}) => ({ ip: d.ip || "unknown", hostname: d.hostname, lastSeen: d.lastSeen }))
                },
                news: {
                    latest: await this.news?.getLatestSignals(50) ?? []
                },
                policy: {
                    version: "1.2.0",
                    mode: Deno.env.get("STRICT_POLICY_ENFORCEMENT") === "true" ? "STRICT" : "ADAPTIVE",
                    remediations: this.autopilot?.getTacticalIntelligence().length ?? 0
                },
                health: {
                    severity: this.healthService?.getGlobalSeverity() || "UNKNOWN",
                    subsystems: this.healthService?.getAllStatuses() || []
                },
                supplyChain: this.supplyChain?.getSBOM() || []
            };

            this.cachedMetrics = metrics;

            this.broadcast({
                type: "DEBUG",
                subType: "METRICS_UPDATE",
                data: metrics
            });
        } catch (e) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:metrics",
                message: `Collection error: ${e instanceof Error ? e.message : String(e)}`
            });
        } finally {
            this.isCollecting = false;
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
