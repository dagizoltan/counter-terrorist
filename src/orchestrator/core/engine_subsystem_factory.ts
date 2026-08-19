import {
    AutopilotService, AutonomousAutopilotService, LifecycleService, ProvisioningService
} from "@domain/index.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LoggingPort } from "@core/ports.ts";
import { CorrelationService } from "@domain/analysis/correlation_service.ts";
import { MeshManager } from "@domain/orchestration/mesh.ts";

export class EngineSubsystemFactory {
    constructor(
        private sidecarManager: SidecarManager,
        private executor: SystemExecutor,
        private logging: LoggingPort
    ) {}

    async initEngine(correlation: CorrelationService, mesh: MeshManager, config: import("./ports/system.ts").ConfigurationPort): Promise<{
        autopilot: import("@domain/index.ts").AutopilotService;
        autonomousAutopilot: import("@domain/index.ts").AutonomousAutopilotService;
        lifecycle: import("@domain/index.ts").LifecycleService;
        policy: import("@domain/index.ts").PolicyEngine;
        correlation: CorrelationService;
        provisioning: import("@domain/index.ts").ProvisioningService;
    }> {
        const autopilot = new AutopilotService(config);
        const autonomousAutopilot = new AutonomousAutopilotService(correlation, this.sidecarManager, this.logging);
        const lifecycle = new LifecycleService(this.sidecarManager, this.logging);
        const provisioning = new ProvisioningService(this.sidecarManager, mesh, this.executor, this.logging, config);

        return { autopilot, autonomousAutopilot, lifecycle, policy: autopilot.getPolicy(), correlation, provisioning };
    }
}
