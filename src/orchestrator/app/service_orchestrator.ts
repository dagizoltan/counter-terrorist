import { ServiceContainer, PlatformInfo } from "@core/container.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { EventBus, MeshManager, HealthService, WatchdogService, setMetricsService } from "@domain/index.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { initBroadcaster } from "@interface/ws_handler.ts";
import { ServiceRegistry, ShutdownPriority } from "@core/registry.ts";
import { WebAdapter } from "@orchestrator/interface/web/web_adapter.tsx";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LogSeverity, LogType } from "@core/ports.ts";
import { ServiceInitializer } from "./service_initializer.ts";

export class ServiceOrchestrator {
    private web!: WebAdapter;
    private initializer: ServiceInitializer;

    constructor(
        private kv: Deno.Kv,
        private sidecarManager: SidecarManager,
        private executor: SystemExecutor,
        private auditService: AuditService,
        private registry: ServiceRegistry
    ) {
        this.initializer = new ServiceInitializer(kv, sidecarManager, executor, auditService, registry);
    }

    async initServices(
        configProvider: EnvConfigProvider, platformInfo: PlatformInfo, notifications: NotificationService,
        eventBus: EventBus, mesh: MeshManager,
        tpm: TPMManager, health: HealthService
    ): Promise<ServiceContainer> {
        initBroadcaster({ notificationService: notifications, auditService: this.auditService, eventBus, loggingService });

        return await this.initializer.initAll(
            configProvider, platformInfo, notifications,
            eventBus, mesh, tpm, health
        );
    }

    async initOperationalLayer(services: ServiceContainer, startSubsystemsDelegate: () => Promise<void>) {
        this.web = new WebAdapter(services);

        const metricsService = services.metrics;
        this.registry.register("DecentralizedMetrics", metricsService, ShutdownPriority.AUXILIARY);
        setMetricsService(metricsService);

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
