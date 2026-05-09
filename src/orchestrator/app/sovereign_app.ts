import { WebAdapter } from "@orchestrator/interface/web/web_adapter.tsx";
import { ProtectionAdapter } from "@infrastructure/system/protection/protection_adapter.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { 
    BaselineService, ProcessTracker, SessionService, ApiKeysService, 
    EventBus, MeshAuthService, ForensicService, MeshManager, 
    PlaybookService, BehavioralService, MetricsService, 
    ShadowProtocolService, GeoIpService, AnonymizationService, 
    CuratedIntelService, DeceptionGridService, MorphingService, 
    ChaosEngine, SupplyChainService, HoneypotService, 
    CanaryService, AutopilotService, KernelService, 
    GovernanceService, ShadowService, CovertChannelService, 
    ProvisioningService, NetworkDiscoveryService, NetworkLogService, 
    IncidentService, ComplianceService, NewsSignalService, 
    LedgerService, HealthService, EventMediator,
    WatchdogService, RateLimitService, TacticalIntelService,
    CorrelationService, PolicyEngine
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { broadcast, initBroadcaster } from "@api/ws.ts";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { bootstrap, camouflage } from "./bootstrapper.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loadConfig } from "@core/config_schema.ts";
import { setMeshManager } from "@domain/orchestration/mesh.ts";
import { setMetricsService } from "@domain/analysis/metrics_service.ts";

// Infrastructure Providers
import { KvAuditRepository } from "@infrastructure/persistence/kv/kv_audit_repository.ts";
import { KvSessionRepository } from "@infrastructure/persistence/kv/kv_session_repository.ts";
import { KvNetworkLogRepository } from "@infrastructure/persistence/kv/kv_network_log_repository.ts";
import { LinuxProcessProvider, MacOSProcessProvider, WindowsProcessProvider } from "@infrastructure/system/process_provider.ts";

import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { AutonomousAutopilotService } from "@domain/analysis/autonomous_autopilot_service.ts";

export class SovereignApp {
    private services!: ServiceContainer;
    private web!: WebAdapter;
    private kv!: Deno.Kv;
    private sidecarManager!: SidecarManager;
    private executor!: SystemExecutor;
    private auditService!: AuditService;

    async boot() {
        // ── Phase 1: Core infrastructure ──────────────────────────────────────
        await this.initCore();

        // ── Phase 1.1: Security Lockdown Check ───────────────────────────────
        const lockdown = await this.kv.get(["system", "lockdown"]);
        if (lockdown.value) {
            const data = lockdown.value as any;
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "SOVEREIGN:BOOT",
                message: `BOOT ABORTED: System is in PERMANENT LOCKDOWN. Reason: ${data.reason}. Timestamp: ${data.timestamp}`
            });
            console.error("!!! CRITICAL: SYSTEM LOCKED !!!");
            console.error(`Reason: ${data.reason}`);
            console.error("Run 'deno run -A scripts/recover.ts' with a valid recovery token to restore access.");
            Deno.exit(1);
        }
        
        const config = loadConfig();
        const configProvider = new EnvConfigProvider(config);
        const platformInfo = await getPlatformInfo(this.executor);
        
        // ── Phase 2: Fundamental Infrastructure ───────────────────────────────
        const tpmManager = new TPMManager(this.sidecarManager, loggingService);
        const notificationService = new NotificationService(this.kv, loggingService);
        const eventBus = new EventBus(loggingService);
        const healthService = new HealthService(loggingService);
        
        // REPOSITORY INJECTION
        const auditRepo = new KvAuditRepository(this.kv);
        this.auditService = new AuditService(auditRepo, loggingService, tpmManager);

        // ── Phase 3: Mesh & Network ──────────────────────────────────────────
        const meshManager = await this.initMesh(tpmManager);

        // ── Phase 4: Hardware Integrity ──────────────────────────────────────
        await this.verifyHardware(tpmManager);

        // ── Phase 5: Service Orchestration ────────────────────────────────────
        this.services = await this.initServices(
            configProvider, platformInfo, notificationService, 
            eventBus, meshManager, tpmManager, healthService
        );

        // ── Phase 6: Web, Metrics & Signals ──────────────────────────────────
        await this.initOperationalLayer(this.services);

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8000);
        this.registerSignalHandlers();
        this.startWatchdog(healthService);

        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.SUCCESS,
            caller: "ORCHESTRATOR",
            message: `Sovereign Orchestrator fully engaged on port ${port}`
        });
        await this.web.start(port);
    }

    private async initCore() {
        loggingService.enableGlobalIntercept();
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "BOOT:INIT",
            message: "Initiating Sovereign Boot Sequence (Self-Test Phase)"
        });
        await camouflage();
        await load({ export: true, allowEmptyValues: true });
        
        this.kv = await Deno.openKv("./volume/storage/orchestrator.db");
        loggingService.setKv(this.kv);
        this.executor = new SystemExecutor();
        this.sidecarManager = new SidecarManager(this.executor, loggingService);
        
        await bootstrap();
    }

    private async initMesh(tpm: TPMManager): Promise<MeshManager> {
        const meshAuthService = new MeshAuthService(this.kv, loggingService, tpm);
        const meshManager = new MeshManager(meshAuthService, loggingService, this.auditService);
        
        setMeshManager(meshManager);
        await meshManager.init();
        meshManager.startDiscovery();
        return meshManager;
    }

    private async initOperationalLayer(services: ServiceContainer) {
        this.web = new WebAdapter(services);
        
        const metricsService = new MetricsService(
            services.protection.firewall as any, 
            services.mesh, 
            services.honeypot, 
            services.processTracker,
            services.kernelService, 
            services.audit, 
            services.canaryService, 
            this.sidecarManager, 
            services.protection.vpn,
            services.behavioral, 
            services.anonymization, 
            services.geoIp, 
            broadcast, 
            services.curatedIntel as any, 
            services.news, 
            services.networkDiscovery, 
            services.autopilot, 
            services.health,
            services.supplyChain
        );
        setMetricsService(metricsService);

        this.wireEvents();
        await this.startSubsystems();
        await this.seedForensics();
    }

    private startWatchdog(health: HealthService) {
        const watchdog = new WatchdogService(health, loggingService, async (name) => {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "SYSTEM:WATCHDOG",
                message: `Attempting to resurrect failed service: ${name}`
            });

            try {
                // 1. Check if it's a sidecar
                const sidecars = ["scanner", "blocker", "honeypot", "pcap", "ebpf", "fim", "vpn"];
                if (sidecars.includes(name.toLowerCase())) {
                    await this.sidecarManager.restartSidecar(name.toLowerCase());
                    return true;
                }

                // 2. Specialized re-initialization for domain services
                if (name === "CuratedIntel") {
                    await this.services.curatedIntel.start(this.kv);
                    return true;
                }
                if (name === "Honeypot") {
                    await this.services.honeypot.start();
                    return true;
                }

                return false;
            } catch (e) {
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "SYSTEM:WATCHDOG",
                    message: `Resurrection failed for ${name}: ${(e as Error).message}`
                });
                return false;
            }
        });
        watchdog.start();
    }

    private async verifyHardware(tpm: TPMManager) {
        const goldenPcrs: Record<number, string> = {};
        for (const [key, value] of Object.entries(Deno.env.toObject())) {
            if (key.startsWith("TPM_GOLDEN_PCR_")) {
                const index = parseInt(key.replace("TPM_GOLDEN_PCR_", ""));
                if (!isNaN(index)) goldenPcrs[index] = value;
            }
        }

        const isHardwareSecure = await tpm.verifyIntegrity(goldenPcrs);
        const bypassToken = Deno.env.get("SECURE_ENVIRONMENT_TOKEN");
        const secureBypass = Deno.env.get("SECURE_BYPASS_TOKEN");

        const isValidBypass = secureBypass && 
                             secureBypass.length >= 32 && 
                             bypassToken === secureBypass &&
                             Deno.env.get("ENVIRONMENT") !== "production";

        if (!isHardwareSecure && !isValidBypass) {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "SECURITY",
                message: "CRITICAL: HARDWARE INTEGRITY FAILURE. Access denied. No valid/secure bypass token provided."
            });
            // ENFORCEMENT: Trigger Emergency Lockdown if integrity fails and no secure bypass is active
            await this.emergencyLockdown("Hardware Integrity Violation");
        } else if (!isHardwareSecure && isValidBypass) {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "SECURITY",
                message: "WARNING: RUNNING IN UNSAFE BYPASS MODE. System integrity is NOT hardware-verified. Environment: " + Deno.env.get("ENVIRONMENT")
            });
        }
    }

    private wireEvents() {
        this.services.mediator.wireSidecars(this.services.command);
    }

    private async startSubsystems() {
        const { playbook, autopilot, autonomousAutopilot, lifecycle, morphing, anonymization, deceptionGrid, processTracker, honeypot, canaryService, kernelService, curatedIntel, news, networkDiscovery, health } = this.services;
        
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "BOOT:DOMAIN",
            message: "Activating autonomous subsystems..."
        });

        const report = (name: string, status: string) => health.reportStatus(name, status);

        report("Playbook", "OPERATIONAL");
        report("Autopilot", "OPERATIONAL");
        report("Morphing", "OPERATIONAL");
        report("Anonymization", "OPERATIONAL");
        report("DeceptionGrid", "OPERATIONAL");
        report("ProcessTracker", "OPERATIONAL");
        
        const wrap = (name: string, promise: Promise<any>) => {
            report(name, "BOOTING");
            promise.then(() => report(name, "OPERATIONAL"))
                   .catch(e => report(name, "FAILED", e.message));
        };

        wrap("Honeypot", honeypot.start());
        wrap("Canary", canaryService.start());
        wrap("KernelService", kernelService.start());
        wrap("CuratedIntel", curatedIntel.start(this.kv));
        wrap("NewsSignal", news.start());
        wrap("NetworkDiscovery", networkDiscovery.start());
        
        lifecycle.start();
        autonomousAutopilot.start();

        this.startDaemons();
    }

    private async startDaemons() {
        const { command: sm } = this.services;
        ["honeypot", "fim", "blocker", "pcap"].forEach(s => sm.getPersistentSidecar(s).catch(() => {}));
        
        const ebpf = await sm.getPersistentSidecar("ebpf").catch(() => null);
        if (ebpf) {
            await sm.sendCommand("ebpf", { type: "HIDE_PID", pid: Deno.pid }).catch(() => {});
            
            // Performance Hardening: Implement in-kernel filtering for "Quiet Security"
            // Skip events from the orchestrator and its trusted sidecars
            for (const comm of ["deno", "blocker", "ebpf", "fim", "pcap", "scanner", "honeypot"]) {
                await sm.sendCommand("ebpf", { type: "TRUST_COMM", comm }).catch(() => {});
            }
        }
    }

    private async seedForensics() {
        const { incidents, networkLogs } = this.services;
        const existing = await incidents.getIncidents();
        if (existing.length > 0) return;

        await networkLogs.log({ direction: "INBOUND", source: "185.220.101.42", destination: "LOCAL", protocol: "TCP/443", length: 512, action: "BLOCK" });
        await incidents.reportIncident({ severity: "HIGH", title: "Suspicious Vault Access", description: "Tor exit node attempt.", source: "Network", indicators: ["185.220.101.42"] });
    }

    private registerSignalHandlers() {
        const cleanup = async () => {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "SYSTEM",
                message: "Initiating graceful shutdown..."
            });

            if (this.web) this.web.stop();
            if (this.sidecarManager) await this.sidecarManager.shutdown();
            if (this.kv) this.kv.close();

            Deno.exit(0);
        };
        ["SIGINT", "SIGTERM"].forEach(s => {
            try { Deno.addSignalListener(s as Deno.Signal, cleanup); } catch {}
        });
    }

    private async initServices(
        configProvider: EnvConfigProvider, platformInfo: any, notifications: NotificationService, 
        eventBus: EventBus, mesh: MeshManager, 
        tpm: TPMManager, health: HealthService
    ): Promise<ServiceContainer> {
        initBroadcaster({ notificationService: notifications, auditService: this.auditService, eventBus, loggingService });

        // REPOSITORY INJECTION
        const networkLogRepo = new KvNetworkLogRepository(this.kv);
        const networkLog = new NetworkLogService(networkLogRepo, loggingService);
        
        const rawProtection = createProtection(this.sidecarManager, this.executor, platformInfo, networkLog);
        await rawProtection.firewall.setKv(this.kv);
        const protection = new ProtectionAdapter(rawProtection);
        
        let processProvider;
        if (platformInfo.name === "macos") {
            processProvider = new MacOSProcessProvider();
        } else if (platformInfo.name === "windows") {
            processProvider = new WindowsProcessProvider();
        } else {
            processProvider = new LinuxProcessProvider();
        }

        const processTracker = new ProcessTracker(loggingService, processProvider, this.sidecarManager);
        
        const sessionRepo = new KvSessionRepository(this.kv);
        const sessions = new SessionService(sessionRepo, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
        
        const apiKeys = new ApiKeysService(this.kv, loggingService);
        const rateLimit = new RateLimitService(this.kv);
        
        const correlation = new CorrelationService(this.auditService, loggingService);
        this.auditService.setCorrelation(correlation);

        const { anonymization, shadowProtocol, behavioral, honeypot, canaryService, kernelService } = this.initSecuritySubsystem(protection, mesh, tpm, health);
        kernelService.setTpmManager(tpm);
        const { geoIp, forensicService, curatedIntel, news, networkDiscovery, incidents, compliance } = this.initIntelligenceSubsystem(protection, processTracker, health, configProvider);

        const playbook = new PlaybookService(this.sidecarManager, protection, notifications, mesh, shadowProtocol, eventBus);
        const { autopilot, autonomousAutopilot, lifecycle, morphing, chaos, supplyChain, shadow, covert, policy } = await this.initEngineSubsystem(correlation, eventBus, playbook, notifications, mesh, shadowProtocol, this.sidecarManager, protection, forensicService, kernelService, processTracker, honeypot, canaryService, health);

        return {
            config: configProvider, protection, command: this.sidecarManager, audit: this.auditService,
            notifications, baseline: new BaselineService(this.kv, this.sidecarManager, this.executor, loggingService), 
            processTracker, sessions, apiKeys, eventBus,
            honeypot, canaryService, kernelService, forensicService,
            autopilot, autonomousAutopilot, lifecycle, logging: loggingService,
            playbook, morphing, chaos,
            supplyChain, mesh, meshAuth: (mesh as any).authService, threatIntel: curatedIntel as any,
            compliance, anonymization, shadowProtocol, deceptionGrid: new DeceptionGridService(honeypot, canaryService, loggingService),
            curatedIntel, news, networkDiscovery, networkLogs: networkLog,
            incidents, platformInfo, shadow, covert,
            ledger: new LedgerService(mesh, loggingService),
            tpm, health,
            mediator: new EventMediator(eventBus, processTracker, canaryService, broadcast, loggingService),
            behavioral, geoIp, rateLimit, policy, correlation
        };
    }

    private initSecuritySubsystem(protection: any, mesh: any, tpm: any, health: any) {
        const anonymization = new AnonymizationService(protection.vpn, loggingService);
        const shadowProtocol = new ShadowProtocolService(mesh, anonymization, loggingService);
        const behavioral = new BehavioralService(protection.firewall as any, this.auditService);
        
        const honeypot = new HoneypotService(this.sidecarManager, protection.firewall, protection.pcap, broadcast, loggingService);
        if (honeypot) honeypot.setBehavioralService(behavioral);

        const canaryService = this.safeInit(health, "Canary", () => new CanaryService(this.auditService, this.sidecarManager, loggingService));
        const kernelService = new KernelService(this.executor, this.auditService, this.sidecarManager);

        return { anonymization, shadowProtocol, behavioral, honeypot, canaryService, kernelService };
    }

    private initIntelligenceSubsystem(protection: any, processTracker: any, health: any, configProvider: any) {
        const geoIp = this.safeInit(health, "GeoIP", () => new GeoIpService(loggingService));
        const forensicService = this.safeInit(health, "Forensics", () => new ForensicService(this.auditService, loggingService, this.kv, processTracker));
        const curatedIntel = this.safeInit(health, "CuratedIntel", () => new CuratedIntelService(loggingService, protection.firewall, configProvider, broadcast, geoIp));
        const news = this.safeInit(health, "News", () => new NewsSignalService(loggingService));
        const networkDiscovery = this.safeInit(health, "NetworkDiscovery", () => new NetworkDiscoveryService(loggingService, this.executor));
        const incidents = this.safeInit(health, "Incidents", () => new IncidentService(this.kv, loggingService));
        const compliance = this.safeInit(health, "Compliance", () => new ComplianceService(this.auditService, this.kv, processTracker));

        return { geoIp, forensicService, curatedIntel, news, networkDiscovery, incidents, compliance };
    }

    private async initEngineSubsystem(correlation: CorrelationService, eventBus: any, playbook: any, notifications: any, mesh: any, shadowProtocol: any, sidecarManager: any, protection: any, forensicService: any, kernelService: any, processTracker: any, honeypot: any, canaryService: any, health: any) {
        const autopilot = new AutopilotService(eventBus, playbook, this.auditService, protection, mesh, notifications, loggingService, processTracker, forensicService, kernelService);
        const autonomousAutopilot = new AutonomousAutopilotService(correlation, sidecarManager, loggingService);
        const lifecycle = new LifecycleService(sidecarManager, loggingService);

        const morphing = this.safeInit(health, "Morphing", () => new MorphingService(honeypot, canaryService, this.auditService, mesh));
        const chaos = this.safeInit(health, "Chaos", () => new ChaosEngine(eventBus, this.auditService, this.sidecarManager));
        const supplyChain = this.safeInit(health, "SupplyChain", () => new SupplyChainService());
        await supplyChain.init();
        const shadow = this.safeInit(health, "Shadow", () => new ShadowService(this.executor, loggingService));
        const covert = this.safeInit(health, "Covert", () => new CovertChannelService(this.executor, loggingService));

        return { autopilot, autonomousAutopilot, lifecycle, morphing, chaos, supplyChain, shadow, covert, policy: autopilot.getPolicy(), correlation };
    }

    private safeInit<T extends object>(health: HealthService, name: string, factory: () => T): T {
        try {
            const service = factory();
            health.reportStatus(name, "OPERATIONAL");
            return service;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "BOOT",
                message: `CRITICAL: Service '${name}' failed to initialize: ${msg}. Deploying Emergency Placeholder.`
            }).catch(() => {});
            health.reportStatus(name, "FAILED", msg);
            
            return new Proxy({} as T, {
                get: (_, prop) => {
                    return (...args: any[]) => {
                        const msg = `[EMERGENCY] Call to '${String(prop)}' on failed service '${name}' blocked.`;
                        loggingService.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity: LogSeverity.ERROR,
                            caller: "EMERGENCY:PROXY",
                            message: msg
                        });
                        return Promise.resolve({ success: false, error: `Service ${name} is unavailable` });
                    };
                }
            });
        }
    }

    private async emergencyLockdown(reason: string = "Hardware Integrity Failure") {
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "SOVEREIGN",
            message: `CRITICAL: EMERGENCY LOCKDOWN ACTIVATED (${reason}). System quarantined. Forensic state preserved. Physical/MFA recovery required.`
        });

        // Persist lockdown state to prevent simple restart bypass
        await this.kv.set(["system", "lockdown"], {
            reason,
            timestamp: new Date().toISOString(),
            status: "QUARANTINED"
        });

        // Disable all network-facing interfaces via eBPF if available
        try {
            await this.sidecarManager.sendCommand("ebpf", { type: "LOCKDOWN" });
        } catch {
            // Best effort
        }

        // Halt execution to prevent further compromise
        Deno.exit(1);
    }
}
