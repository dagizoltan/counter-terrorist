import {
    AnonymizationService, ShadowProtocolService, BehavioralService,
    HoneypotService, CanaryService, KernelService
} from "@domain/index.ts";
import { ConfigurationPort, ProtectionPort, LoggingPort } from "@core/ports.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { HealthService } from "@domain/analysis/health_service.ts";
import { ServiceRegistry } from "./registry.ts";

export class SecuritySubsystemFactory {
    constructor(
        private logging: LoggingPort,
        private executor: SystemExecutor,
        private sidecarManager: SidecarManager,
        private auditService: AuditService,
        private _registry: ServiceRegistry,
        private createServiceDelegate: <T extends object>(health: HealthService, name: string, factory: () => T) => T
    ) {}

    initSecurity(protection: ProtectionPort, mesh: any, config: ConfigurationPort, health: HealthService) {
        const anonymization = new AnonymizationService(protection.vpn, this.logging);
        anonymization.setFirewall(protection.firewall);
        const shadowProtocol = new ShadowProtocolService(mesh, anonymization, this.logging);
        const behavioral = new BehavioralService(protection.firewall, this.auditService);
        const honeypot = new HoneypotService(this.sidecarManager, protection.firewall, protection.pcap, this.logging);

        const canaryService = this.createServiceDelegate(health, "Canary", () => new CanaryService(this.auditService, this.sidecarManager, this.logging));
        const kernelService = new KernelService(this.executor, this.auditService, config, this.sidecarManager, this.sidecarManager.getTpm());

        return { anonymization, shadowProtocol, behavioral, honeypot, canaryService, kernelService };
    }
}
