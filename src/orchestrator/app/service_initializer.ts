import { ForensicArtifactLifecycleManager } from "@domain/analysis/forensic_lifecycle.ts";
import { ServiceContainer, PlatformInfo } from "@core/container.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { EventBus, MeshManager, HealthService, CorrelationService, PlaybookService, DecentralizedMetricsService } from "@domain/index.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { SubsystemFactory } from "@core/subsystem_factory.ts";
import { ServiceRegistry, ShutdownPriority } from "@core/registry.ts";
import { serviceLocator } from "@core/service_locator.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { broadcast } from "@interface/ws_handler.ts";

/**
 * ServiceInitializer
 * Responsible for the step-by-step instantiation and wiring of all domain services.
 * Following the Single Responsibility Principle, it decouples the ServiceOrchestrator
 * from the granular details of service dependency graphs.
 */
export class ServiceInitializer {
    private factory: SubsystemFactory;

    constructor(
        private kv: Deno.Kv,
        private sidecarManager: SidecarManager,
        private executor: SystemExecutor,
        private auditService: AuditService,
        private registry: ServiceRegistry
    ) {
        this.factory = new SubsystemFactory(this.kv, loggingService, this.executor, this.sidecarManager, this.auditService, this.registry);
    }

    async initAll(
        configProvider: EnvConfigProvider, platformInfo: PlatformInfo, notifications: NotificationService,
        eventBus: EventBus, mesh: MeshManager,
        tpm: TPMManager, health: HealthService
    ): Promise<ServiceContainer> {

        // 1. Identity & Access
        const identity = this.factory.initIdentity(configProvider);
        this.registry.register("Sessions", identity.sessions, ShutdownPriority.AUXILIARY);
        this.registry.register("ApiKeys", identity.apiKeys, ShutdownPriority.CRITICAL);
        this.registry.register("RateLimit", identity.rateLimit, ShutdownPriority.CRITICAL);

        // 2. Protection Layer
        const { protection, networkLog } = await this.factory.initProtection(platformInfo, configProvider);
        this.registry.register("NetworkLog", networkLog, ShutdownPriority.AUXILIARY);

        // 3. Telemetry & Analysis
        const processTracker = this.factory.initProcessTracker(platformInfo);
        this.registry.register("ProcessTracker", processTracker, ShutdownPriority.CRITICAL);

        const correlation = new CorrelationService(this.auditService, loggingService);
        this.auditService.setCorrelation(correlation);

        const security = this.factory.initSecurity(protection, mesh, configProvider, health);
        serviceLocator.register("protection", protection);
        serviceLocator.register("behavioral", security.behavioral);
        serviceLocator.register("honeypot", security.honeypot);
        serviceLocator.register("shadowProtocol", security.shadowProtocol);

        const intelligence = this.factory.initIntelligence(protection, processTracker, health, configProvider, mesh, identity.meshAuth);
        this.registry.register("GeoIp", intelligence.geoIp, ShutdownPriority.AUXILIARY);
        this.registry.register("Forensics", intelligence.forensicService, ShutdownPriority.AUXILIARY);
        this.registry.register("CuratedIntel", intelligence.curatedIntel, ShutdownPriority.AUXILIARY);
        this.registry.register("NewsSignal", intelligence.news, ShutdownPriority.AUXILIARY);
        this.registry.register("NetworkDiscovery", intelligence.networkDiscovery, ShutdownPriority.AUXILIARY);
        this.registry.register("Incidents", intelligence.incidents, ShutdownPriority.AUXILIARY);
        this.registry.register("Compliance", intelligence.compliance, ShutdownPriority.AUXILIARY);

        // 4. Governance & Automation
        const playbook = new PlaybookService();
        playbook.setLocator(serviceLocator);
        serviceLocator.register("playbook", playbook);
        this.registry.register("Playbook", playbook, ShutdownPriority.AUXILIARY);

        const { autopilot, autonomousAutopilot, lifecycle, policy, provisioning } = await this.factory.initEngine(correlation, mesh);
        this.registry.register("Autopilot", autopilot, ShutdownPriority.AUXILIARY);
        this.registry.register("AutonomousAutopilot", autonomousAutopilot, ShutdownPriority.AUXILIARY);
        this.registry.register("Lifecycle", lifecycle, ShutdownPriority.AUXILIARY);
        this.registry.register("Policy", policy, ShutdownPriority.AUXILIARY);
        this.registry.register("Provisioning", provisioning, ShutdownPriority.AUXILIARY);

        health.registerService("autopilot", autopilot);
        health.registerService("lifecycle", lifecycle);
        health.registerService("policy", policy);

        // 5. Operations & Resilience
        const forensicLifecycle = new ForensicArtifactLifecycleManager(loggingService, configProvider);
        lifecycle.addCustomTask(() => forensicLifecycle.enforceQuota());

        const operational = this.factory.initOperational(health, mesh, tpm, eventBus, processTracker, security, broadcast);
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
            commandBus: serviceLocator.get("commandBus") as any,
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
            metrics: operational.metrics as DecentralizedMetricsService,
            mediator: operational.mediator,
            behavioral: security.behavioral,
            geoIp: intelligence.geoIp,
            correlation,
            rateLimit: identity.rateLimit,
            lsmLearning: operational.lsmLearning,
            platformInfo,
            viewModel: operational.viewModel
        };

        // Populate Service Locator
        for (const [key, service] of Object.entries(services)) {
            if (!serviceLocator.has(key)) {
                serviceLocator.register(key as any, service);
            }
        }

        return services;
    }
}
