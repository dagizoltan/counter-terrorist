import { ForensicArtifactLifecycleManager } from "@domain/analysis/forensic_lifecycle.ts";
import { ServiceContainer, PlatformInfo } from "@core/container.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { EventBus, MeshManager, HealthService, WatchdogService, CorrelationService, PlaybookService, DecentralizedMetricsService, setMetricsService } from "@domain/index.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { initBroadcaster, broadcast } from "@interface/ws_handler.ts";
import { SubsystemFactory } from "@core/subsystem_factory.ts";
import { ServiceRegistry, ShutdownPriority } from "@core/registry.ts";
import { serviceLocator } from "@core/service_locator.ts";
import { WebAdapter } from "@orchestrator/interface/web/web_adapter.tsx";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export class ServiceOrchestrator {
    private web!: WebAdapter;

    constructor(
        private kv: Deno.Kv,
        private sidecarManager: SidecarManager,
        private executor: SystemExecutor,
        private auditService: AuditService,
        private registry: ServiceRegistry
    ) {}

    async initServices(
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

        const forensicLifecycle = new ForensicArtifactLifecycleManager(loggingService, configProvider);
         lifecycle.addCustomTask(() => forensicLifecycle.cleanup());
        const operational = factory.initOperational(health, mesh, tpm, eventBus, processTracker, security, broadcast);
        this.registry.register("Integrity", operational.integrity, ShutdownPriority.CRITICAL);
        this.registry.register("Morphing", operational.morphing, ShutdownPriority.AUXILIARY);
        this.registry.register("Chaos", operational.chaos, ShutdownPriority.AUXILIARY);
        this.registry.register("SupplyChain", operational.supplyChain, ShutdownPriority.AUXILIARY);
        this.registry.register("Shadow", operational.shadow, ShutdownPriority.AUXILIARY);
        this.registry.register("Covert", operational.covert, ShutdownPriority.NETWORK);
        this.registry.register("Ledger", operational.ledger, ShutdownPriority.CRITICAL);
        this.registry.register("ViewModel", operational.viewModel, ShutdownPriority.INTERFACE);
        this.registry.register("EventMediator", operational.mediator, ShutdownPriority.AUXILIARY);
        this.registry.register("LsmLearning", operational.lsmLearning, ShutdownPriority.AUXILIARY);
        this.registry.register("Anonymization", security.anonymization, ShutdownPriority.NETWORK);
        this.registry.register("ShadowProtocol", security.shadowProtocol, ShutdownPriority.AUXILIARY);
        this.registry.register("Behavioral", security.behavioral, ShutdownPriority.AUXILIARY);
        this.registry.register("Honeypot", security.honeypot, ShutdownPriority.AUXILIARY);

        health.registerService("anonymization", security.anonymization);
        health.registerService("shadowProtocol", security.shadowProtocol);
        health.registerService("behavioral", security.behavioral);
        health.registerService("honeypot", security.honeypot);

        const services: ServiceContainer = {
            config: configProvider,
            protection,
            command: this.sidecarManager,
            audit: this.auditService,
            notifications,
            baseline: operational.baseline,
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
            morphing: operational.morphing,
            chaos: operational.chaos,
            supplyChain: operational.supplyChain,
            mesh,
            meshAuth: identity.meshAuth,
            threatIntel: intelligence.curatedIntel,
            compliance: intelligence.compliance,
            anonymization: security.anonymization,
            shadowProtocol: security.shadowProtocol,
            deceptionGrid: operational.deceptionGrid,
            curatedIntel: intelligence.curatedIntel,
            news: intelligence.news,
            networkDiscovery: intelligence.networkDiscovery,
            networkLogs: networkLog,
            provisioning,
            integrity: operational.integrity,
            incidents: intelligence.incidents,
            shadow: operational.shadow,
            covert: operational.covert,
            ledger: operational.ledger,
            tpm,
            policy,
            health,
            metrics: {} as any,
            mediator: operational.mediator,
            behavioral: security.behavioral,
            geoIp: intelligence.geoIp,
            correlation,
            rateLimit: identity.rateLimit,
            lsmLearning: operational.lsmLearning,
            platformInfo,
            viewModel: operational.viewModel
        };

        for (const [key, service] of Object.entries(services)) {
            if (!serviceLocator.has(key)) {
                serviceLocator.register(key as any, service);
            }
        }

        return services;
    }

    async initOperationalLayer(services: ServiceContainer, startSubsystemsDelegate: () => Promise<void>) {
        this.web = new WebAdapter(services);

        const metricsService = new DecentralizedMetricsService(
            services.eventBus,
            loggingService
        );
        services.metrics = metricsService;
        this.registry.register("DecentralizedMetrics", metricsService, ShutdownPriority.AUXILIARY);
        setMetricsService(metricsService as any);

        this.injectEventBus(services);
        this.wireEvents(services);
        await startSubsystemsDelegate();
    }

    private injectEventBus(services: ServiceContainer) {
        const bus = services.eventBus;

        for (const service of Object.values(services)) {
            if (this.isBusAware(service)) {
                service.setEventBus(bus);
            }
        }

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

    private wireEvents(services: ServiceContainer) {
        services.mediator.wireSidecars(services.command);
    }

    startWatchdog(health: HealthService, services: ServiceContainer): WatchdogService {
        const watchdog = new WatchdogService(health, loggingService, async (name) => {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:app:service_orchestrator:watchdog",
                message: `Attempting to resurrect failed service: ${name}`
            });

            try {
                const sidecars = ["analyzer", "enforcer", "decoy", "netcap", "sentinel", "watchfile", "tunnel"];
                if (sidecars.includes(name.toLowerCase())) {
                    await this.sidecarManager.restartSidecar(name.toLowerCase());
                    return true;
                }

                if (name === "CuratedIntel") {
                    await services.curatedIntel.init(this.kv);
                    return true;
                }
                if (name === "Honeypot") {
                    await services.honeypot.start();
                    return true;
                }
                if (name === "Lure") {
                    await services.autopilot.spawnLureProcess();
                    return true;
                }

                return false;
            } catch (e) {
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:service_orchestrator:watchdog",
                    message: `Resurrection failed for ${name}: ${(e as Error).message}`
                });
                return false;
            }
        });
        watchdog.start();
        return watchdog;
    }

    getWebAdapter() {
        return this.web;
    }
}
