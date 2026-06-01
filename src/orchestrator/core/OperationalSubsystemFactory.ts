import {
    MorphingService, ChaosEngine, SupplyChainService,
    ShadowService, CovertChannelService, LedgerService,
    ViewModelService, EventMediator, IntegrityService,
    LsmLearningService, BaselineService, DeceptionGridService
} from "@domain/index.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LoggingPort, EventBusPort, TpmPort } from "@core/ports.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { MeshManager } from "@domain/orchestration/mesh.ts";
import { HealthService } from "@domain/analysis/health_service.ts";
import { ProcessTracker } from "@domain/analysis/process_tracker.ts";

export class OperationalSubsystemFactory {
    constructor(
        private kv: Deno.Kv,
        private logging: LoggingPort,
        private sidecarManager: SidecarManager,
        private executor: SystemExecutor,
        private auditService: AuditService,
        private createServiceDelegate: <T extends object>(health: HealthService, name: string, factory: () => T) => T
    ) {}

    initOperational(
        health: HealthService, mesh: MeshManager, tpm: TpmPort,
        eventBus: EventBusPort, processTracker: ProcessTracker,
        security: { honeypot: import("@domain/index.ts").HoneypotService; canaryService: import("@domain/index.ts").CanaryService },
        broadcast: (event: any) => void
    ): {
        integrity: import("@domain/index.ts").IntegrityService;
        morphing: import("@domain/index.ts").MorphingService;
        chaos: import("@domain/index.ts").ChaosEngine;
        supplyChain: import("@domain/index.ts").SupplyChainService;
        shadow: import("@domain/index.ts").ShadowService;
        covert: import("@domain/index.ts").CovertChannelService;
        ledger: import("@domain/index.ts").LedgerService;
        viewModel: import("@domain/index.ts").ViewModelService;
        mediator: import("@domain/index.ts").EventMediator;
        baseline: import("@domain/index.ts").BaselineService;
        deceptionGrid: import("@domain/index.ts").DeceptionGridService;
        lsmLearning: import("@domain/index.ts").LsmLearningService;
    } {
        const lsmLearning = new LsmLearningService(this.sidecarManager, this.logging);

        const integrity = this.createServiceDelegate(health, "Integrity", () => {
            const service = new IntegrityService(mesh, this.auditService, tpm as any, this.logging);
            service.setSidecarManager(this.sidecarManager as any);
            return service;
        });

        const morphing = this.createServiceDelegate(health, "Morphing", () => {
            const service = new MorphingService(security.honeypot, security.canaryService, this.auditService, mesh);
            service.setFfi(this.sidecarManager.getFfi());
            return service;
        });

        const chaos = this.createServiceDelegate(health, "Chaos", () => new ChaosEngine(eventBus as any, this.auditService, this.sidecarManager));
        const supplyChain = this.createServiceDelegate(health, "SupplyChain", () => new SupplyChainService());
        const shadow = this.createServiceDelegate(health, "Shadow", () => new ShadowService(this.executor, this.logging));
        const covert = this.createServiceDelegate(health, "Covert", () => new CovertChannelService(this.executor, this.logging));
        const ledger = new LedgerService(mesh, this.logging);
        const viewModel = new ViewModelService();
        const mediator = new EventMediator(eventBus as any, processTracker, security.canaryService, broadcast, this.logging, this.kv);
        const baseline = new BaselineService(this.kv, this.sidecarManager, this.executor, this.logging);
        const deceptionGrid = new DeceptionGridService(security.honeypot, security.canaryService, this.logging);

        return {
            integrity, morphing, chaos, supplyChain, shadow,
            covert, ledger, viewModel, mediator, baseline,
            deceptionGrid, lsmLearning
        };
    }
}
