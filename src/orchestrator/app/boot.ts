import { SystemExecutor } from "../infrastructure/system/system_executor.ts";
import { SidecarManager } from "../infrastructure/runtime/sidecar_manager.ts";
import { loggingService } from "../infrastructure/system/logging.ts";
import { ServiceRegistry } from "../core/registry.ts";
import { EnvConfigProvider } from "../infrastructure/config/env_config_provider.ts";
import { AuditService } from "../domain/analysis/audit.ts";
import { KvAuditRepository } from "../infrastructure/persistence/kv/kv_audit_repository.ts";
import { TPMManager } from "../infrastructure/system/protection/tpm/tpm_manager.ts";

/**
 * Core Infrastructure Bootstrapper
 * Initializes the foundational layers of the orchestrator in a deterministic order.
 */
export async function bootstrapCore(config: EnvConfigProvider) {
    // 1. Logging and Registry
    ServiceRegistry.register("config", config);
    ServiceRegistry.register("logging", loggingService);
    loggingService.enableGlobalIntercept();

    // 2. Persistence
    const dbPath = config.getEnv("KV_PATH") || "./volume/storage/orchestrator.db";
    const kv = await Deno.openKv(dbPath);
    ServiceRegistry.register("kv", kv);
    loggingService.setKv(kv);

    // 3. Execution Layer
    const executor = new SystemExecutor();
    ServiceRegistry.register("executor", executor);

    // 3.1 Verify Core Dependencies (Advisory)
    const required = ["ip", "sha256sum", "nmcli"];
    for (const cmd of required) {
        executor.exists(cmd).then(exists => {
            if (!exists) {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:boot",
                    message: `ADVISORY: System command '${cmd}' not found. Some functionality will be restricted.`
                });
            }
        });
    }

    const sidecarManager = new SidecarManager(executor, loggingService);
    ServiceRegistry.register("commands", sidecarManager);
    ServiceRegistry.register("sidecarManager", sidecarManager);

    // 4. Hardware Security Layer
    const tpmManager = new TPMManager(sidecarManager, loggingService);
    ServiceRegistry.register("tpm", tpmManager);

    // 5. Audit & Integrity Layer (Independent Service)
    const auditRepo = new KvAuditRepository(kv);
    const auditService = new AuditService(auditRepo, loggingService, tpmManager);
    ServiceRegistry.register("audit", auditService);

    return { kv, executor, sidecarManager, loggingService, auditService, tpmManager };
}
