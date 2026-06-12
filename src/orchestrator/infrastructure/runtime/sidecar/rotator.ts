import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { SIDECAR_REGISTRY } from "../sidecar_registry.ts";
import { IntegrityManager } from "./integrity_manager.ts";
import { SidecarRepository } from "./repository.ts";

export interface SidecarRotatorDependencies {
    stopSidecar(name: string): Promise<void>;
    getPersistentSidecar(name: string): Promise<Deno.ChildProcess | null>;
}

export class SidecarRotator {
    constructor(
        private logging: LoggingPort,
        private integrity: IntegrityManager,
        private repository: SidecarRepository,
        private deps: SidecarRotatorDependencies
    ) {}

    async rotateSidecar(name: string, config: ConfigurationPort) {
        const sidecarConfig = SIDECAR_REGISTRY[name];
        if (!sidecarConfig) return;

        const binPath = `./bin/agents/${sidecarConfig.binaryName || name}`;

        // 1. Forced re-healing from Golden Repository
        const healed = await this.integrity.verifyAndHeal(
            name,
            binPath,
            this.repository.getManifest(),
            config,
            true
        );

        if (healed) {
            // 2. Graceful restart
            await this.deps.stopSidecar(name);
            await this.deps.getPersistentSidecar(name);

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:infra:runtime:sidecar_rotator",
                message: `Agent ${name} rotated and re-spawned from Golden Baseline.`
            });
        }
    }

    async rotateAll(names: string[], config: ConfigurationPort) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:infra:runtime:sidecar_rotator",
            message: "CYCLIC ROTATION TRIGGERED: Re-verifying and refreshing all agent binaries..."
        });

        for (const name of names) {
            await this.rotateSidecar(name, config);
        }
    }
}
