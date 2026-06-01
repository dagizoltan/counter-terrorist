import { ConfigurationPort } from "@core/ports.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { HealthService } from "@domain/analysis/health_service.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogType, LogSeverity } from "@core/ports.ts";
import { bootstrap } from "./bootstrapper.ts";
import { EventBus } from "@domain/index.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { ServiceRegistry, ShutdownPriority } from "@core/registry.ts";
import { MeshManager } from "@domain/orchestration/mesh.ts";
import { MeshAuthService } from "@domain/index.ts";
import { setMeshManager } from "@domain/orchestration/mesh.ts";
import { SystemLifecycleService } from "@domain/analysis/system_lifecycle_service.ts";

export class ApplicationManager {
    constructor(
        private kv: Deno.Kv,
        private sidecarManager: SidecarManager,
        private registry: ServiceRegistry
    ) {}

    async initializeInfrastructure(configProvider: ConfigurationPort, tpmManager: TPMManager, auditService: AuditService, lifecycleService: SystemLifecycleService) {
        const platformInfo = await (await import("@infrastructure/system/platform.ts")).getPlatformInfo(new (await import("@infrastructure/system/system_executor.ts")).SystemExecutor() as any);

        await bootstrap();
        const eventBus = new EventBus(loggingService);
        const notificationService = new NotificationService(this.kv, loggingService);
        this.registry.register("Notifications", notificationService, ShutdownPriority.AUXILIARY);
        const healthService = new HealthService(loggingService);
        healthService.setSidecarManager(this.sidecarManager);

        auditService.setConfig(configProvider);
        const auditInitRes = await auditService.init();
        if (!auditInitRes.success) {
            throw new Error(`Audit Integrity Violation: ${auditInitRes.error.message}`);
        }

        const meshManager = await this.initMesh(tpmManager, configProvider, auditService);
        const meshInitRes = await meshManager.init();
        if (!meshInitRes.success) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:app:application_manager",
                message: `Mesh initialization non-critical failure: ${meshInitRes.error.message}`
            });
        }

        const isHardwareSecure = await lifecycleService.verifyHardware(configProvider);
        if (!isHardwareSecure) {
            throw new Error("Hardware Integrity Violation");
        }

        return { platformInfo, notificationService, eventBus, meshManager, healthService };
    }

    private initMesh(tpm: TPMManager, config: ConfigurationPort, auditService: AuditService): Promise<MeshManager> {
        const meshAuthService = new MeshAuthService(this.kv, loggingService, config, tpm);
        this.registry.register("MeshAuth", meshAuthService, ShutdownPriority.NETWORK);
        const meshManager = new MeshManager(meshAuthService, loggingService, auditService, config);
        this.registry.register("Mesh", meshManager, ShutdownPriority.NETWORK);

        setMeshManager(meshManager);
        meshManager.startDiscovery();
        return Promise.resolve(meshManager);
    }
}
