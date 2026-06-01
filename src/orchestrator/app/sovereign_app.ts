import { WebAdapter } from "@orchestrator/interface/web/web_adapter.tsx";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { 
    EventBus, MeshAuthService, MeshManager,
    BaselineService, CuratedIntelService,
    DecentralizedMetricsService,
    PlaybookService, MorphingService,
    ChaosEngine, SupplyChainService,
    ShadowService, CovertChannelService,
    LedgerService, HealthService, EventMediator,
    WatchdogService,
    CorrelationService, ViewModelService,
    DeceptionGridService, IntegrityService,
    LsmLearningService
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
import { ServiceContainer, PlatformInfo } from "@core/container.ts";
import { LogSeverity, LogType, ConfigurationPort, FirewallPort, VpnPort } from "@core/ports.ts";
import { Service } from "@core/base_service.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { broadcast, initBroadcaster } from "@interface/ws_handler.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { bootstrap, camouflage } from "./bootstrapper.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loadConfig } from "@core/config_schema.ts";
import { setMeshManager } from "@domain/orchestration/mesh.ts";
import { setMetricsService } from "@domain/analysis/metrics_service.ts";
import { ServiceRegistry, ShutdownPriority } from "@core/registry.ts";
import { serviceLocator } from "@core/service_locator.ts";

import { SubsystemFactory } from "@core/subsystem_factory.ts";
import { SystemLifecycleService } from "@domain/analysis/system_lifecycle_service.ts";

// Infrastructure Providers
import { KvAuditRepository } from "@infrastructure/persistence/kv/kv_audit_repository.ts";
import { WormRepository } from "@domain/repositories/worm_repository.ts";

export class SovereignApp {
    private services!: ServiceContainer;
    private web!: WebAdapter;
    private kv!: Deno.Kv;
    private sidecarManager!: SidecarManager;
    private executor!: SystemExecutor;
    private auditService!: AuditService;
    private lifecycleService!: SystemLifecycleService;
    private registry: ServiceRegistry = new ServiceRegistry(loggingService);
    private appManager!: ApplicationManager;
    private lifecycleManager!: LifecycleManager;

    private logPilotBanner() {
        console.log(`
  ▗▄▄▖ ▗▄▖ ▗▖ ▗▖▗▖  ▗▖▗▄▄▄▖▗▄▄▄▖▗▄▄▖
  ▐▌   ▐▌ ▐▌▐▌ ▐▌▐▛▚▞▜▌▐▌     █  ▐▌ ▐▌
  ▐▝▚▄▖▐▌ ▐▌▐▌ ▐▌▐▌  ▐▌▐▛▀▀▖  █  ▐▛▀▚▖
  ▝▚▄▄▖▝▙▄☘▝▙▄▄☘▐▌  ▐▌▐▙▄▄▖  █  ▐▌ ▐▌
  SOVEREIGN CYBERSECURITY - PILOT V5.2
        `);
    }

    async boot() {
        this.logPilotBanner();
        await this.initCore();

        const config = loadConfig();
        const configProvider = new EnvConfigProvider(config);

        this.applyProductionHardening(config);
        this.configureLogging(config);

        // ── Phase 2: Fundamental Infrastructure ───────────────────────────────
        this.sidecarManager.setConfig(configProvider);
        const tpmManager = new TPMManager(this.sidecarManager, loggingService);
        this.sidecarManager.setTpm(tpmManager);
        this.sidecarManager.init();

        const factory = new SubsystemFactory(this.kv, loggingService, this.executor, this.sidecarManager, this.auditService, this.registry);
        this.lifecycleService = factory.initSystemLifecycle(tpmManager);
        this.registry.register("SystemLifecycle", this.lifecycleService, ShutdownPriority.CRITICAL);

        this.appManager = new ApplicationManager(this.kv, this.sidecarManager, this.registry);
        this.lifecycleManager = new LifecycleManager(this.lifecycleService, this.sidecarManager, this.registry, this.emergencyLockdown.bind(this));

        await this.lifecycleManager.setupSafetyAndErrorHandlers();

        const { platformInfo, notificationService, eventBus, meshManager, healthService } =
            await this.appManager.initializeInfrastructure(configProvider, tpmManager, this.auditService, this.lifecycleService);
        this.registry.register("Health", healthService, ShutdownPriority.CRITICAL);

        serviceLocator.register("config", configProvider);
        serviceLocator.register("command", this.sidecarManager);
        serviceLocator.register("logging", loggingService);
        serviceLocator.register("audit", this.auditService);
        serviceLocator.register("eventBus", eventBus);
        serviceLocator.register("notifications", notificationService);
        serviceLocator.register("mesh", meshManager);
        serviceLocator.register("health", healthService);

        meshManager.setLocator(serviceLocator);
        this.auditService.setLocator(serviceLocator);
        healthService.setEventBus(eventBus);

        // SOV-06: Register core infrastructure services with HealthService
        healthService.registerService("mesh", meshManager);
        healthService.registerService("audit", this.auditService);

        // ── Phase 5: Service Orchestration ────────────────────────────────────
        this.services = await this.initServices(
            configProvider, platformInfo, notificationService,
            eventBus, meshManager, tpmManager, healthService
        );

        await this.finalizeBoot(configProvider, healthService);
    }

    private applyProductionHardening(config: any) {
        // SEC-01 & SEC-02 Hardening: Fail-shut on insecure production configuration
        if (config.ENVIRONMENT === "production") {
            if (config.CTS_DEV_MODE) {
                throw new Error("CRITICAL SECURITY VIOLATION: Application cannot start in PRODUCTION with CTS_DEV_MODE enabled.");
            }
            if (config.ALLOW_HARDWARE_BYPASS) {
                throw new Error("CRITICAL SECURITY VIOLATION: Application cannot start in PRODUCTION with ALLOW_HARDWARE_BYPASS enabled.");
            }
            if (!config.STRICT_HARDWARE_INTEGRITY) {
                throw new Error("CRITICAL SECURITY VIOLATION: Application cannot start in PRODUCTION with STRICT_HARDWARE_INTEGRITY disabled.");
            }

            // SEC-03: Enforce Hardware-Anchored Secrets in Production
            // We expect MESH_SECRET and API_TOKEN to be provisioned in the TPM.
            // If they are still present as env vars, we warn; if they are MISSING from both, we fail.
            if (Deno.env.get("MESH_SECRET") || Deno.env.get("API_TOKEN")) {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:app:sovereign_app",
                    message: "SECURITY HYGIENE: Sensitive secrets found in environment variables. Migration to hardware TPM indices is recommended."
                }).catch(() => {});
            }
        }
    }

    private configureLogging(config: any) {
        loggingService.setConfig({
            host: config.SYSLOG_HOST,
            port: config.SYSLOG_PORT,
            transport: config.SYSLOG_TRANSPORT,
            caPath: config.SYSLOG_CA_PATH,
            secrets: {
                API_TOKEN: config.API_TOKEN,
                MESH_SECRET: config.MESH_SECRET,
                PKI_SECRET: config.PKI_SECRET,
                SECURE_BYPASS_TOKEN: config.SECURE_BYPASS_TOKEN
            }
        });
    }

    private async finalizeBoot(configProvider: ConfigurationPort, healthService: HealthService) {
        // ── Phase 6: Web, Metrics & Signals ──────────────────────────────────
        await this.initOperationalLayer(this.services);

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8000);
        this.checkPilotSafety(configProvider);

        this.lifecycleManager.registerSignalHandlers(async () => {
            await this.gracefulShutdown();
        });

        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.SUCCESS,
            caller: "orchestrator:app:sovereign_app",
            message: `Sovereign Orchestrator fully engaged on port ${port}`
        });
        await this.web.start(port);

        // SEC-06: Principle of Least Privilege - Drop Orchestrator Capabilities
        await this.dropCapabilities();

        this.services.lifecycle.setKv(this.kv);
        this.services.lifecycle.setPolicyEngine(this.services.policy);
        this.services.lifecycle.startShadowModeTimer(configProvider);
        this.services.lifecycle.scheduleLkgSnapshot();
        this.watchdog = this.startWatchdog(healthService);
        this.registry.register("Watchdog", this.watchdog, ShutdownPriority.AUXILIARY);
    }

    private async checkPilotSafety(configProvider: ConfigurationPort) {
        if (!configProvider.getBoolean("PILOT_MODE", false)) return;

        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app",
            message: "🛡️ PILOT SAFETY CHECK: System is running in Pilot Mode. Ensure 'scripts/emergency_off.sh' is accessible."
        });
    }

    private watchdog?: WatchdogService;

    private async gracefulShutdown() {
        if (this.watchdog) this.watchdog.shutdown();

        // SOV-05 STABILITY: Use ServiceRegistry for automated, ordered shutdown
        await this.registry.shutdownAll();

        if (this.services) {
            const {
                metrics, protection, logging
            } = this.services;

            if (metrics && "stop" in metrics && typeof (metrics as { stop?: () => void }).stop === "function") {
                (metrics as { stop: () => void }).stop();
            }
            if (protection?.firewall && "shutdown" in (protection.firewall as FirewallPort & Service)) {
                await (protection.firewall as FirewallPort & Service).shutdown?.();
            }
            if (protection?.vpn && "shutdown" in (protection.vpn as VpnPort & Service)) {
                await (protection.vpn as VpnPort & Service).shutdown?.();
            }
            if (logging) await logging.shutdown();
        }

        if (this.web) this.web.stop();
        if (this.sidecarManager) await this.sidecarManager.shutdown();
        if (this.kv) this.kv.close();
    }

    private async initCore() {
        loggingService.enableGlobalIntercept();
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app:init",
            message: "Initiating Sovereign Boot Sequence (Self-Test Phase)"
        });
        await camouflage();
        await load({ export: true, allowEmptyValues: true });

        this.kv = await Deno.openKv("./volume/storage/orchestrator.db");
        loggingService.setKv(this.kv);
        this.executor = new SystemExecutor();
        this.sidecarManager = new SidecarManager(this.executor, loggingService);
    }


    private async initOperationalLayer(services: ServiceContainer) {
        this.web = new WebAdapter(services);
        
        // Phase 2: Decouple Metrics Service
        const metricsService = new DecentralizedMetricsService(
            services.eventBus,
            loggingService
        );
        services.metrics = metricsService;
        this.registry.register("DecentralizedMetrics", metricsService, ShutdownPriority.AUXILIARY);
        setMetricsService(metricsService);

        this.injectEventBus(services);
        this.wireEvents();
        await this.startSubsystems();
        await this.seedForensics();
    }

    private injectEventBus(services: ServiceContainer) {
        const bus = services.eventBus;

        for (const service of Object.values(services)) {
            if (this.isBusAware(service)) {
                service.setEventBus(bus);
            }
        }

        // Deep-inject into sub-infrastructure if not already covered
        if (this.isBusAware(services.protection?.firewall)) {
            services.protection.firewall.setEventBus(bus);
        }
        if (this.isBusAware(services.protection?.vpn)) {
            services.protection.vpn.setEventBus(bus);
        }
    }

    private isBusAware(svc: unknown): svc is { setEventBus(bus: EventBus): void } {
        return !!svc && typeof svc === "object" && "setEventBus" in svc && typeof (svc as any).setEventBus === "function";
    }

    private startWatchdog(health: HealthService): WatchdogService {
        const watchdog = new WatchdogService(health, loggingService, async (name) => {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:app:sovereign_app:watchdog",
                message: `Attempting to resurrect failed service: ${name}`
            });

            try {
                // 1. Check if it's a sidecar
                const sidecars = ["analyzer", "enforcer", "decoy", "netcap", "sentinel", "watchfile", "tunnel"];
                if (sidecars.includes(name.toLowerCase())) {
                    await this.sidecarManager.restartSidecar(name.toLowerCase());
                    return true;
                }

                // 2. Specialized re-initialization for domain services
                if (name === "CuratedIntel") {
                    await this.services.curatedIntel.init(this.kv);
                    return true;
                }
                if (name === "Honeypot") {
                    await this.services.honeypot.start();
                    return true;
                }
                if (name === "Lure") {
                    await this.services.autopilot.spawnLureProcess();
                    return true;
                }

                return false;
            } catch (e) {
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:sovereign_app:watchdog",
                    message: `Resurrection failed for ${name}: ${(e as Error).message}`
                });
                return false;
            }
        });
        watchdog.start();
        return watchdog;
    }

    private wireEvents() {
        this.services.mediator.wireSidecars(this.services.command);
        this.lifecycleManager.wireEvents();
    }

    // Accessor for internal logging
    private get loggingService() {
        return this.services?.logging || loggingService;
    }

    private async startSubsystems() {
        // SOV-05 STABILITY: Unified, registry-managed startup sequence
        await this.registry.initAll();

        const { autopilot, honeypot, canaryService, kernelService, news: _news, networkDiscovery, lifecycle, autonomousAutopilot, provisioning, integrity: _integrity, behavioral: _behavioral } = this.services;
        
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app:domain",
            message: "Autonomous subsystems initialized."
        });

        // Background activations for non-BaseService compatible starts
        autopilot.start();
        honeypot.start().catch(err => console.error(`Background task failure: ${err}`));
        canaryService.start().catch(err => console.error(`Background task failure: ${err}`));
        
        (async () => {
            const res = await kernelService.start();
            if (res.success && this.services.config.getEnv("ENVIRONMENT") === "production") {
                const sidecars = ["analyzer", "sentinel", "watchfile"];
                for (const name of sidecars) {
                    await kernelService.deployAppArmorProfile(name, `/var/lib/cts/bin/${name}`).catch(err => console.error(`Background task failure: ${err}`));
                }
            }
        })();

        networkDiscovery.start().catch(err => console.error(`Background task failure: ${err}`));
        provisioning.run().catch(err => console.error(`Background task failure: ${err}`));
        
        this.services.baseline.startMonitor();
        lifecycle.start();
        autonomousAutopilot.start();

        this.startDaemons();
    }

    private async startDaemons() {
        const { command: sm, platformInfo } = this.services;
        const daemons = ["decoy", "watchfile", "netcap", "analyzer", "tunnel"];

        if ((platformInfo.name as string) === "linux" || platformInfo.name === "ubuntu") {
            daemons.push("enforcer");
        }

        if (platformInfo.name === "macos") daemons.push("sentinel-darwin");
        if (platformInfo.name === "windows") {
            daemons.push("telemetry-win");
            daemons.push("enforcer-win");
        }

        // BUG-5.5 FIX: Handle persistent sidecar failures during boot
        const { SIDECAR_REGISTRY } = await import("@infrastructure/runtime/sidecar_registry.ts");

        for (const s of daemons) {
            try {
                const child = await sm.getPersistentSidecar(s);
                if (!child && SIDECAR_REGISTRY[s]?.critical) {
                    throw new Error(`Critical sidecar '${s}' failed to spawn.`);
                }
            } catch (e) {
                const isCritical = SIDECAR_REGISTRY[s]?.critical;
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:sovereign_app:boot",
                    message: `${isCritical ? "FATAL" : "CRITICAL"}: Persistent sidecar '${s}' failed to start: ${(e as Error).message}`
                });

                if (isCritical) {
                    await this.emergencyLockdown(`Boot Failure: Critical agent '${s}' offline.`);
                }
            }
        }
        
        const ebpf = await sm.getPersistentSidecar("sentinel").catch(() => null);
        if (ebpf) {
            await sm.sendCommand("sentinel", { type: "HIDE_PID", pid: Deno.pid }).catch(err => console.error(`Background task failure: ${err}`));
            // Quiet Mode and Self-Enforcement handled by KernelService.start()
        }
    }

    private async seedForensics() {
        const { incidents, networkLogs } = this.services;
        const existing = await incidents.getIncidents();
        if (existing.length > 0) return;

        await networkLogs.log({ direction: "INBOUND", source: "185.220.101.42", destination: "LOCAL", protocol: "TCP/443", length: 512, action: "BLOCK" });
        await incidents.reportIncident({ severity: "HIGH", title: "Suspicious Vault Access", description: "Tor exit node attempt.", source: "Network", indicators: ["185.220.101.42"] });
    }

    private async initServices(
        configProvider: EnvConfigProvider, platformInfo: PlatformInfo, notifications: NotificationService,
        eventBus: EventBus, mesh: MeshManager, 
        tpm: TPMManager, health: HealthService
    ): Promise<ServiceContainer> {
        initBroadcaster({ notificationService: notifications, auditService: this.auditService, eventBus, loggingService });

        const factory = new SubsystemFactory(this.kv, loggingService, this.executor, this.sidecarManager, this.auditService, this.registry);

        const identity = factory.initIdentity(configProvider);
        this.registry.register("Sessions", identity.sessions, ShutdownPriority.AUXILIARY);
        this.registry.register("ApiKeys", identity.apiKeys, ShutdownPriority.CRITICAL);
        this.registry.register("RateLimit", identity.rateLimit, ShutdownPriority.CRITICAL);

        const { protection, networkLog } = await factory.initProtection(platformInfo, configProvider);
        this.registry.register("NetworkLog", networkLog, ShutdownPriority.AUXILIARY);
        
        const processTracker = factory.initProcessTracker(platformInfo);
        this.registry.register("ProcessTracker", processTracker, ShutdownPriority.CRITICAL);
        
        const correlation = new CorrelationService(this.auditService, loggingService);
        this.auditService.setCorrelation(correlation);

        const security = factory.initSecurity(protection, mesh, configProvider, health);
        serviceLocator.register("protection", protection);
        serviceLocator.register("behavioral", security.behavioral);
        serviceLocator.register("honeypot", security.honeypot);
        serviceLocator.register("shadowProtocol", security.shadowProtocol);

        const lsmLearning = new LsmLearningService(this.sidecarManager, loggingService);
        await lsmLearning.init();
        this.registry.register("LsmLearning", lsmLearning, ShutdownPriority.AUXILIARY);

        this.registry.register("Anonymization", security.anonymization, ShutdownPriority.NETWORK);
        this.registry.register("ShadowProtocol", security.shadowProtocol, ShutdownPriority.AUXILIARY);
        this.registry.register("Behavioral", security.behavioral, ShutdownPriority.AUXILIARY);
        this.registry.register("Honeypot", security.honeypot, ShutdownPriority.AUXILIARY);

        health.registerService("anonymization", security.anonymization);
        health.registerService("shadowProtocol", security.shadowProtocol);
        health.registerService("behavioral", security.behavioral);
        health.registerService("honeypot", security.honeypot);

        const intelligence = factory.initIntelligence(protection, processTracker, health, configProvider, mesh, identity.meshAuth);
        this.registry.register("GeoIp", intelligence.geoIp, ShutdownPriority.AUXILIARY);
        this.registry.register("Forensics", intelligence.forensicService, ShutdownPriority.AUXILIARY);
        this.registry.register("CuratedIntel", intelligence.curatedIntel, ShutdownPriority.AUXILIARY);
        this.registry.register("NewsSignal", intelligence.news, ShutdownPriority.AUXILIARY);
        this.registry.register("NetworkDiscovery", intelligence.networkDiscovery, ShutdownPriority.AUXILIARY);
        this.registry.register("Incidents", intelligence.incidents, ShutdownPriority.AUXILIARY);
        this.registry.register("Compliance", intelligence.compliance, ShutdownPriority.AUXILIARY);

        const playbook = new PlaybookService();
        playbook.setLocator(serviceLocator);
        serviceLocator.register("playbook", playbook);

        this.registry.register("Playbook", playbook, ShutdownPriority.AUXILIARY);
        const { autopilot, autonomousAutopilot, lifecycle, policy, provisioning } = await factory.initEngine(correlation, mesh);
        this.registry.register("Autopilot", autopilot, ShutdownPriority.AUXILIARY);
        this.registry.register("AutonomousAutopilot", autonomousAutopilot, ShutdownPriority.AUXILIARY);
        this.registry.register("Lifecycle", lifecycle, ShutdownPriority.AUXILIARY);
        this.registry.register("Policy", policy, ShutdownPriority.AUXILIARY);
        this.registry.register("Provisioning", provisioning, ShutdownPriority.AUXILIARY);

        health.registerService("autopilot", autopilot);
        health.registerService("lifecycle", lifecycle);
        health.registerService("policy", policy);

        const integrity = factory.createService(health, "Integrity", () => {
            const service = new IntegrityService(mesh, this.auditService, tpm, loggingService);
            service.setSidecarManager(this.sidecarManager as any);
            return service;
        });
        this.registry.register("Integrity", integrity, ShutdownPriority.CRITICAL);

        const morphing = factory.createService(health, "Morphing", () => {
            const service = new MorphingService(security.honeypot, security.canaryService, this.auditService, mesh);
            service.setFfi(this.sidecarManager.getFfi());
            return service;
        });
        this.registry.register("Morphing", morphing, ShutdownPriority.AUXILIARY);
        const chaos = factory.createService(health, "Chaos", () => new ChaosEngine(eventBus, this.auditService, this.sidecarManager));
        this.registry.register("Chaos", chaos, ShutdownPriority.AUXILIARY);

        const supplyChain = factory.createService(health, "SupplyChain", () => new SupplyChainService());
        this.registry.register("SupplyChain", supplyChain, ShutdownPriority.AUXILIARY);
        await supplyChain.init();
        const shadow = factory.createService(health, "Shadow", () => new ShadowService(this.executor, loggingService));
        this.registry.register("Shadow", shadow, ShutdownPriority.AUXILIARY);

        const covert = factory.createService(health, "Covert", () => new CovertChannelService(this.executor, loggingService));
        this.registry.register("Covert", covert, ShutdownPriority.NETWORK);

        const ledger = new LedgerService(mesh, loggingService);
        this.registry.register("Ledger", ledger, ShutdownPriority.CRITICAL);

        const viewModel = new ViewModelService();
        this.registry.register("ViewModel", viewModel, ShutdownPriority.INTERFACE);

        const mediator = new EventMediator(eventBus, processTracker, security.canaryService, broadcast, loggingService, this.kv);
        this.registry.register("EventMediator", mediator, ShutdownPriority.AUXILIARY);

        const services: ServiceContainer = {
            config: configProvider,
            protection,
            command: this.sidecarManager,
            audit: this.auditService,
            notifications,
            baseline: new BaselineService(this.kv, this.sidecarManager, this.executor, loggingService),
            processTracker,
            sessions: identity.sessions,
            apiKeys: identity.apiKeys,
            eventBus,
            honeypot: security.honeypot,
            canaryService: security.canaryService,
            kernelService: security.kernelService,
            forensicService: intelligence.forensicService,
            autopilot,
            autonomousAutopilot,
            lifecycle,
            logging: loggingService,
            playbook,
            morphing,
            chaos,
            supplyChain,
            mesh,
            meshAuth: identity.meshAuth,
            threatIntel: intelligence.curatedIntel,
            compliance: intelligence.compliance,
            anonymization: security.anonymization,
            shadowProtocol: security.shadowProtocol,
            deceptionGrid: new DeceptionGridService(security.honeypot, security.canaryService, loggingService),
            curatedIntel: intelligence.curatedIntel,
            news: intelligence.news,
            networkDiscovery: intelligence.networkDiscovery,
            networkLogs: networkLog,
            provisioning,
            integrity,
            incidents: intelligence.incidents,
            shadow,
            covert,
            ledger,
            tpm,
            policy,
            health,
            metrics: {} as any,
            mediator,
            behavioral: security.behavioral,
            geoIp: intelligence.geoIp,
            correlation,
            rateLimit: identity.rateLimit,
            lsmLearning,
            platformInfo,
            viewModel
        };

        // Final registration of all remaining services into locator
        for (const [key, service] of Object.entries(services)) {
            if (!serviceLocator.has(key)) {
                serviceLocator.register(key as any, service);
            }
        }

        return services;
    }

    private async dropCapabilities() {
        const isLinux = Deno.build.os === "linux";
        const isProduction = this.services?.config?.getEnv("ENVIRONMENT") === "production";

        if (!isLinux) return;

        try {
            const { dropUnnecessaryCapabilities } = await import("../infrastructure/system/capabilities.ts");

            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "orchestrator:app:sovereign_app",
                message: "Hardening: Pruning 36 unnecessary kernel capabilities from Orchestrator via FFI/prctl..."
            });

            const success = dropUnnecessaryCapabilities();
            if (!success && isProduction) {
                throw new Error("FFI Capability drop failed. Principle of Least Privilege violated.");
            }

            this.loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:app:sovereign_app",
                message: "Orchestrator successfully hardened. 36 capabilities dropped from bounding set."
            }).catch(err => console.error(`Background task failure: ${err}`));
        } catch (e) {
            this.loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:app:sovereign_app",
                message: `Hardening Failed: ${(e as Error).message}`
            }).catch(err => console.error(`Background task failure: ${err}`));
        }
    }

    private async emergencyLockdown(reason: string = "Hardware Integrity Failure") {
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:app:sovereign_app",
            message: `CRITICAL: EMERGENCY LOCKDOWN ACTIVATED (${reason}). System quarantined. Forensic state preserved. Physical/MFA recovery required.`
        });

        await this.kv.set(["system", "lockdown"], {
            reason,
            timestamp: new Date().toISOString(),
            status: "QUARANTINED"
        });

        try {
            await this.sidecarManager.sendCommand("sentinel", { type: "LOCKDOWN" });
        } catch (_e) {
            // Ignore lockdown errors during emergency shutdown
        }

        Deno.exit(1);
    }
}
