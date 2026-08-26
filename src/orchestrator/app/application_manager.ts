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
import { ServiceContainer } from "@core/container.ts";

export class ApplicationManager {
    constructor(
        private kv: Deno.Kv,
        private sidecarManager: SidecarManager,
        private registry: ServiceRegistry
    ) {}

    async initializeInfrastructure(configProvider: ConfigurationPort, tpmManager: TPMManager, auditService: AuditService, lifecycleService: SystemLifecycleService) {
        const executor = new (await import("@infrastructure/system/system_executor.ts")).SystemExecutor();
        const platformInfo = await (await import("@infrastructure/system/platform.ts")).getPlatformInfo(executor);

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

    async startDaemons(services: ServiceContainer) {
        const { command: sm, platformInfo } = services;
        const daemons = ["decoy", "watchfile", "netcap", "analyzer", "tunnel"];

        if (platformInfo.name === "linux" || platformInfo.name === "ubuntu") {
            daemons.push("enforcer");
        }

        if (platformInfo.name === "macos") daemons.push("sentinel-darwin");
        if (platformInfo.name === "windows") {
            daemons.push("telemetry-win");
            daemons.push("enforcer-win");
        }

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
                    caller: "orchestrator:app:application_manager:boot",
                    message: `${isCritical ? "FATAL" : "CRITICAL"}: Persistent sidecar '${s}' failed to start: ${(e as Error).message}`
                });

                if (isCritical) {
                    throw e;
                }
            }
        }

        const ebpf = await sm.getPersistentSidecar("sentinel").catch(() => null);
        if (ebpf) {
            await sm.sendCommand("sentinel", { type: "HIDE_PID", pid: Deno.pid }).catch(err => console.error(`Background task failure: ${err}`));
        }
    }

    async seedForensics(services: ServiceContainer) {
        const { incidents, networkLogs } = services;
        const existing = await incidents.getIncidents();
        if (existing.length > 0) return;

        await networkLogs.logNetwork({ direction: "INBOUND", source: "185.220.101.42", destination: "LOCAL", protocol: "TCP/443", length: 512, action: "BLOCK" });
        await incidents.reportIncident({ severity: "HIGH", title: "Suspicious Vault Access", description: "Tor exit node attempt.", source: "Network", indicators: ["185.220.101.42"] });
    }
}
