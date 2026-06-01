import { ServiceLocatorPort } from "./ports/system.ts";

/**
 * ServiceMap defines the registry of all services available in the Sovereign Orchestrator.
 * This provides compile-time type safety for service retrieval.
 */
export interface ServiceMap {
  "config": import("./ports/system.ts").ConfigurationPort;
  "command": import("../infrastructure/runtime/sidecar_manager.ts").SidecarManager;
  "logging": import("./ports/logging.ts").LoggingPort;
  "audit": import("../domain/analysis/audit.ts").AuditService;
  "eventBus": import("../domain/analysis/events.ts").EventBus;
  "notifications": import("../domain/analysis/notifications.ts").NotificationService;
  "mesh": import("../domain/orchestration/mesh.ts").MeshManager;
  "health": import("../domain/analysis/health_service.ts").HealthService;
  "protection": import("./ports/security.ts").ProtectionPort;
  "playbook": import("../domain/orchestration/playbook_service.ts").PlaybookService;
  "autopilot": import("../domain/orchestration/autopilot_service.ts").AutopilotService;
  "shadow": import("../domain/protection/shadow_service.ts").ShadowService;
  "covert": import("../domain/orchestration/covert_service.ts").CovertChannelService;
  "ledger": import("../domain/analysis/ledger_service.ts").LedgerService;
  "autonomousAutopilot": import("../domain/analysis/autonomous_autopilot_service.ts").AutonomousAutopilotService;
  "lifecycle": import("../domain/analysis/lifecycle_service.ts").LifecycleService;
  "policy": import("../domain/orchestration/policy_engine.ts").PolicyEngine;
  "provisioning": import("../domain/orchestration/provisioning_service.ts").ProvisioningService;
  "integrity": import("../domain/analysis/integrity_service.ts").IntegrityService;
  "processTracker": import("../domain/analysis/process_tracker.ts").ProcessTracker;
  "behavioral": import("../domain/analysis/behavioral_service.ts").BehavioralService;
  "honeypot": import("../domain/protection/honeypot_service.ts").HoneypotService;
  "shadowProtocol": import("../domain/protection/shadow_protocol_service.ts").ShadowProtocolService;
  "lsmLearning": import("../domain/protection/lsm_learning_service.ts").LsmLearningService;
  "morphing": import("../domain/orchestration/morphing_service.ts").MorphingService;
  "chaos": import("../domain/orchestration/chaos_engine.ts").ChaosEngine;
  "supplyChain": import("../domain/orchestration/supply_chain_service.ts").SupplyChainService;
  "canaryService": import("../domain/protection/canary_service.ts").CanaryService;
  "kernelService": import("../domain/protection/kernel_service.ts").KernelService;
  "forensicService": import("../domain/analysis/forensic_service.ts").ForensicService;
  "incidents": import("../domain/analysis/incident_service.ts").IncidentService;
  "viewModel": import("../domain/analysis/view_model_service.ts").ViewModelService;
  "tpm": import("../infrastructure/system/protection/tpm/tpm_manager.ts").TPMManager;
}

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
