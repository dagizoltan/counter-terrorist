import { ServiceLocatorPort } from "./ports/system.ts";

/**
 * Domain-specific service groupings to modularize the ServiceMap.
 */

export interface InfrastructureServices {
  "config": import("./ports/system.ts").ConfigurationPort;
  "command": import("../infrastructure/runtime/sidecar_manager.ts").SidecarManager;
  "logging": import("./ports/logging.ts").LoggingPort;
  "eventBus": import("../domain/analysis/events.ts").EventBus;
  "tpm": import("../infrastructure/system/protection/tpm/tpm_manager.ts").TPMManager;
}

export interface AnalysisServices {
  "audit": import("../domain/analysis/audit.ts").AuditService;
  "health": import("../domain/analysis/health_service.ts").HealthService;
  "ledger": import("../domain/analysis/ledger_service.ts").LedgerService;
  "integrity": import("../domain/analysis/integrity_service.ts").IntegrityService;
  "processTracker": import("../domain/analysis/process_tracker.ts").ProcessTracker;
  "behavioral": import("../domain/analysis/behavioral_service.ts").BehavioralService;
  "supplyChain": import("../domain/analysis/supply_chain.ts").SupplyChainService;
  "forensicService": import("../domain/analysis/forensic_service.ts").ForensicService;
  "incidents": import("../domain/analysis/incident_service.ts").IncidentService;
  "viewModel": import("../domain/analysis/view_model_service.ts").ViewModelService;
  "compliance": import("../domain/analysis/compliance_service.ts").ComplianceService;
  "baseline": import("../domain/analysis/baseline.ts").BaselineService;
  "geoIp": import("../domain/analysis/geoip_service.ts").GeoIpService;
  "correlation": import("../domain/analysis/correlation_service.ts").CorrelationService;
  "metrics": import("../domain/analysis/decentralized_metrics.ts").DecentralizedMetricsService;
  "mediator": import("../domain/analysis/event_mediator.ts").EventMediator;
  "curatedIntel": import("../domain/analysis/curated_intel_service.ts").CuratedIntelService;
  "threatIntel": import("../domain/analysis/curated_intel_service.ts").CuratedIntelService | import("../domain/analysis/tactical_intel_ingestor.ts").TacticalIntelIngestor;
  "networkLogs": import("../domain/analysis/network_log_service.ts").NetworkLogService;
  "news": import("../domain/analysis/news_signal_service.ts").NewsSignalService;
  "networkDiscovery": import("../domain/analysis/network_discovery.ts").NetworkDiscoveryService;
  "lifecycle": import("../domain/analysis/lifecycle_service.ts").LifecycleService;
  "autonomousAutopilot": import("../domain/analysis/autonomous_autopilot_service.ts").AutonomousAutopilotService;
  "activeSocketService": import("../domain/analysis/active_socket_service.ts").ActiveSocketService;
}

export interface SecurityServices {
  "protection": import("./ports/security.ts").ProtectionPort;
  "shadow": import("../domain/protection/shadow_service.ts").ShadowService;
  "honeypot": import("../domain/protection/honeypot_service.ts").HoneypotService;
  "shadowProtocol": import("../domain/protection/shadow_protocol_service.ts").ShadowProtocolService;
  "lsmLearning": import("../domain/protection/lsm_learning_service.ts").LsmLearningService;
  "morphing": import("../domain/protection/morphing_service.ts").MorphingService;
  "canaryService": import("../domain/protection/canary_service.ts").CanaryService;
  "kernelService": import("../domain/protection/kernel_service.ts").KernelService;
  "deceptionGrid": import("../domain/protection/deception_grid.ts").DeceptionGridService;
  "anonymization": import("../domain/protection/anonymization_service.ts").AnonymizationService;
}

export interface OrchestrationServices {
  "mesh": import("../domain/orchestration/mesh.ts").MeshManager;
  "notifications": import("../domain/analysis/notifications.ts").NotificationService;
  "playbook": import("../domain/orchestration/playbook_service.ts").PlaybookService;
  "covert": import("../domain/orchestration/covert_service.ts").CovertChannelService;
  "policy": import("../domain/orchestration/policy_engine.ts").PolicyEngine;
  "provisioning": import("../domain/orchestration/provisioning_service.ts").ProvisioningService;
  "chaos": import("../domain/orchestration/chaos_engine.ts").ChaosEngine;
  "autopilot": import("../domain/orchestration/autopilot_service.ts").AutopilotService;
}

export interface IdentityServices {
  "rateLimit": import("../domain/identity/rate_limit.ts").RateLimitService;
  "sessions": import("../domain/identity/session.ts").SessionService;
  "apiKeys": import("../domain/identity/api_keys.ts").ApiKeysService;
  "meshAuth": import("../domain/identity/mesh_auth.ts").MeshAuthService;
}

/**
 * ServiceMap defines the registry of all services available in the Sovereign Orchestrator.
 * This provides compile-time type safety for service retrieval.
 * Now composed of domain-specific sub-interfaces to improve maintainability.
 */
export interface ServiceMap extends
  InfrastructureServices,
  AnalysisServices,
  SecurityServices,
  OrchestrationServices,
  IdentityServices {}

export class ServiceLocator implements ServiceLocatorPort {
  private services = new Map<keyof ServiceMap | string, ServiceMap[keyof ServiceMap]>();

  register<K extends keyof ServiceMap>(key: K, service: ServiceMap[K]): void;
  register<K extends string>(key: K, service: ServiceMap[keyof ServiceMap]): void;
  register(key: string, service: ServiceMap[keyof ServiceMap]): void {
    this.services.set(key, service);
  }

  get<K extends keyof ServiceMap>(key: K): ServiceMap[K];
  get<T>(key: string): T;
  get(key: string): ServiceMap[keyof ServiceMap] {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service ${key} not registered`);
    }
    return service;
  }

  has(key: string): boolean {
    return this.services.has(key);
  }
}

export const serviceLocator = new ServiceLocator();
