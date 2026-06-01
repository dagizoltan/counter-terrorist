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

import { ApplicationManager } from "./application_manager.ts";
import { LifecycleManager } from "./lifecycle_manager.ts";
import { HardeningManager } from "../infrastructure/system/HardeningManager.ts";
import { ServiceOrchestrator } from "./service_orchestrator.ts";

export class SovereignApp {
    private services!: ServiceContainer;
    private kv!: Deno.Kv;
    private sidecarManager!: SidecarManager;
    private executor!: SystemExecutor;
    private auditService!: AuditService;
    private lifecycleService!: SystemLifecycleService;
    private registry: ServiceRegistry = new ServiceRegistry(loggingService);
    private appManager!: ApplicationManager;
    private lifecycleManager!: LifecycleManager;
    private hardeningManager!: HardeningManager;
    private serviceOrchestrator!: ServiceOrchestrator;

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

        await this.hardeningManager.applyProductionHardening(config);
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
        this.serviceOrchestrator = new ServiceOrchestrator(this.kv, this.sidecarManager, this.executor, this.auditService, this.registry);

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
        this.services = await this.serviceOrchestrator.initServices(
            configProvider, platformInfo, notificationService,
            eventBus, meshManager, tpmManager, healthService
        );

        await this.finalizeBoot(configProvider, healthService);
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
        await this.serviceOrchestrator.initOperationalLayer(this.services, this.startSubsystems.bind(this));

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8000);
        await this.hardeningManager.checkPilotSafety(configProvider);

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
        await this.serviceOrchestrator.getWebAdapter().start(port);

        // SEC-06: Principle of Least Privilege - Drop Orchestrator Capabilities
        await this.hardeningManager.dropCapabilities(configProvider);

        this.services.lifecycle.setKv(this.kv);
        this.services.lifecycle.setPolicyEngine(this.services.policy);
        this.services.lifecycle.startShadowModeTimer(configProvider);
        this.services.lifecycle.scheduleLkgSnapshot();
        this.watchdog = this.serviceOrchestrator.startWatchdog(healthService, this.services);
        this.registry.register("Watchdog", this.watchdog, ShutdownPriority.AUXILIARY);
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

        if (this.serviceOrchestrator?.getWebAdapter()) this.serviceOrchestrator.getWebAdapter().stop();
        if (this.sidecarManager) await this.sidecarManager.shutdown();
        if (this.kv) this.kv.close();
    }

    private async initCore() {
        loggingService.enableGlobalIntercept();
        this.hardeningManager = new HardeningManager(loggingService);

        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app:init",
            message: "Initiating Sovereign Boot Sequence (Self-Test Phase)"
        });

        await this.hardeningManager.applyCamouflage();
        await load({ export: true, allowEmptyValues: true });

        this.kv = await Deno.openKv("./volume/storage/orchestrator.db");
        loggingService.setKv(this.kv);
        this.executor = new SystemExecutor();
        this.sidecarManager = new SidecarManager(this.executor, loggingService);
    }


    private wireEvents() {
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

        await this.appManager.startDaemons(this.services);
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
