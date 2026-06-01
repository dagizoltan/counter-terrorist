import { ServiceContainer, PlatformInfo } from "./container.ts";
import { ConfigurationPort } from "./ports/system.ts";
import { ProtectionPort } from "./ports/security.ts";
import {
    BaselineService, ProcessTracker, SessionService, ApiKeysService,
    EventBus, MeshAuthService, ForensicService, MeshManager,
    DecentralizedMetricsService,
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
    CorrelationService, PolicyEngine, AutoBlockService
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { KvSessionRepository } from "@infrastructure/persistence/kv/kv_session_repository.ts";
import { KvNetworkLogRepository } from "@infrastructure/persistence/kv/kv_network_log_repository.ts";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { ProtectionAdapter } from "@infrastructure/system/protection/protection_adapter.ts";
import { LinuxProcessProvider, MacOSProcessProvider, WindowsProcessProvider } from "@infrastructure/system/process_provider.ts";
import { LoggingPort, LogType, LogSeverity } from "./ports/logging.ts";
import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { AutonomousAutopilotService } from "@domain/analysis/autonomous_autopilot_service.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { SystemLifecycleService } from "@domain/analysis/system_lifecycle_service.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { ServiceRegistry } from "./registry.ts";
import { SecuritySubsystemFactory } from "./SecuritySubsystemFactory.ts";
import { IntelligenceSubsystemFactory } from "./IntelligenceSubsystemFactory.ts";

export class SubsystemFactory {
    private securityFactory: SecuritySubsystemFactory;
    private intelligenceFactory: IntelligenceSubsystemFactory;

    constructor(
        private kv: Deno.Kv,
        private logging: LoggingPort,
        private executor: SystemExecutor,
        private sidecarManager: SidecarManager,
        private auditService: AuditService,
        private registry: ServiceRegistry
    ) {
        this.securityFactory = new SecuritySubsystemFactory(logging, executor, sidecarManager, auditService, registry, this.createService.bind(this));
        this.intelligenceFactory = new IntelligenceSubsystemFactory(kv, logging, executor, auditService, this.createService.bind(this));
    }

    initIdentity(config: EnvConfigProvider) {
        const sessionRepo = new KvSessionRepository(this.kv);
        const sessions = new SessionService(sessionRepo, this.logging, config.getNumber("SESSION_TTL_HOURS", 24));
        const apiKeys = new ApiKeysService(this.kv, this.logging);
        const rateLimit = new RateLimitService(this.kv);
        const meshAuth = new MeshAuthService(this.kv, this.logging, config, this.sidecarManager.getTpm());
        return { sessions, apiKeys, rateLimit, meshAuth };
    }

    async initProtection(platformInfo: PlatformInfo, config: EnvConfigProvider) {
        const networkLogRepo = new KvNetworkLogRepository(this.kv);
        const networkLog = new NetworkLogService(networkLogRepo, this.logging);
        const rawProtection = createProtection(this.sidecarManager, this.executor, platformInfo, networkLog);
        await rawProtection.firewall.setKv(this.kv);
        const protection = new ProtectionAdapter(rawProtection);
        if ("setConfig" in rawProtection.firewall && typeof rawProtection.firewall.setConfig === "function") {
            rawProtection.firewall.setConfig(config);
        }
        return { protection, networkLog };
    }

    initSecurity(protection: ProtectionPort, mesh: MeshManager, config: ConfigurationPort, health: HealthService) {
        return this.securityFactory.initSecurity(protection, mesh, config, health);
    }

    initIntelligence(protection: ProtectionPort, processTracker: ProcessTracker, health: HealthService, config: ConfigurationPort, mesh: MeshManager, meshAuth: MeshAuthService) {
        return this.intelligenceFactory.initIntelligence(protection, processTracker, health, config, mesh, meshAuth);
    }

    async initEngine(correlation: CorrelationService, mesh: MeshManager) {
        const autopilot = new AutopilotService();
        const autonomousAutopilot = new AutonomousAutopilotService(correlation, this.sidecarManager, this.logging);
        const lifecycle = new LifecycleService(this.sidecarManager, this.logging);
        const provisioning = new ProvisioningService(this.sidecarManager, mesh, this.executor, this.logging);

        return { autopilot, autonomousAutopilot, lifecycle, policy: autopilot.getPolicy(), correlation, provisioning };
    }

    initProcessTracker(platformInfo: PlatformInfo) {
        let processProvider;
        if (platformInfo.name === "macos") {
            processProvider = new MacOSProcessProvider();
        } else if (platformInfo.name === "windows") {
            processProvider = new WindowsProcessProvider();
        } else {
            processProvider = new LinuxProcessProvider();
        }
        return new ProcessTracker(this.logging, processProvider, this.sidecarManager);
    }

    initSystemLifecycle(tpm: TPMManager): SystemLifecycleService {
        return new SystemLifecycleService(this.logging, tpm, this.kv);
    }

    public createService<T extends object>(health: HealthService, name: string, factory: () => T): T {
        try {
            const service = factory();
            health.reportStatus(name, "OPERATIONAL");
            // Automatically register any Sovereign service for lifecycle management
            if (this.isLifecycleService(service)) {
                this.registry.register(name, service);
            }
            return service;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:app:subsystem_factory",
                message: `CRITICAL: Service '${name}' failed to initialize: ${msg}. Deploying Emergency Placeholder.`
            }).catch(() => {});
            health.reportStatus(name, "FAILED", msg);

            return new Proxy({} as T, {
                get: (_, prop) => {
                    return (...args: any[]) => {
                        return Promise.resolve({ success: false, error: `Service ${name} is unavailable` });
                    };
                }
            });
        }
    }

    private isLifecycleService(svc: unknown): svc is import("./base_service.ts").Service {
        return !!svc && typeof svc === "object" && ("init" in svc || "shutdown" in svc);
    }
}
