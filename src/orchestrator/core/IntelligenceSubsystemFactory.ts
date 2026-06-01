import {
    GeoIpService, ForensicService, CuratedIntelService, NewsSignalService,
    NetworkDiscoveryService, IncidentService, ComplianceService
} from "@domain/index.ts";
import { ConfigurationPort, ProtectionPort, LoggingPort } from "@core/ports.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { HealthService } from "@domain/analysis/health_service.ts";
import { ProcessTracker } from "@domain/analysis/process_tracker.ts";

export class IntelligenceSubsystemFactory {
    constructor(
        private kv: Deno.Kv,
        private logging: LoggingPort,
        private executor: any,
        private auditService: AuditService,
        private createServiceDelegate: <T extends object>(health: HealthService, name: string, factory: () => T) => T
    ) {}

    initIntelligence(protection: ProtectionPort, processTracker: ProcessTracker, health: HealthService, config: ConfigurationPort, mesh: any, meshAuth: any) {
        const geoIp = this.createServiceDelegate(health, "GeoIP", () => new GeoIpService(this.logging));
        const forensicService = this.createServiceDelegate(health, "Forensics", () => new ForensicService(this.auditService, this.logging, this.kv, processTracker, meshAuth));
        const curatedIntel = this.createServiceDelegate(health, "CuratedIntel", () => new CuratedIntelService(this.logging, protection.firewall, config, geoIp));
        const news = this.createServiceDelegate(health, "News", () => new NewsSignalService(this.logging));
        const networkDiscovery = this.createServiceDelegate(health, "NetworkDiscovery", () => {
            const svc = new NetworkDiscoveryService(this.logging, this.executor);
            svc.setMesh(mesh);
            return svc;
        });
        const incidents = this.createServiceDelegate(health, "Incidents", () => new IncidentService(this.kv, this.logging));
        const compliance = this.createServiceDelegate(health, "Compliance", () => new ComplianceService(this.auditService, this.kv, processTracker));

        return { geoIp, forensicService, curatedIntel, news, networkDiscovery, incidents, compliance };
    }
}
