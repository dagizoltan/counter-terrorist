import { ServiceLocatorPort } from "./ports.ts";

/**
 * ServiceMap defines the registry of all services available in the Sovereign Orchestrator.
 * This provides compile-time type safety for service retrieval.
 */
export interface ServiceMap {
  "config": import("./ports.ts").ConfigurationPort;
  "command": import("../infrastructure/runtime/sidecar_manager.ts").SidecarManager;
  "logging": import("./ports.ts").LoggingPort;
  "audit": import("../domain/analysis/audit.ts").AuditService;
  "eventBus": import("../domain/analysis/events.ts").EventBus;
  "notifications": import("../domain/analysis/notifications.ts").NotificationService;
  "mesh": import("../domain/orchestration/mesh.ts").MeshManager;
  "health": import("../domain/analysis/health_service.ts").HealthService;
  "protection": import("./ports.ts").ProtectionPort;
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
  [key: string]: any;
}

export class ServiceLocator implements ServiceLocatorPort {
  private services = new Map<string, any>();

  register<K extends keyof ServiceMap>(key: K, service: ServiceMap[K]): void;
  register(key: string, service: any): void;
  register(key: string, service: any): void {
    this.services.set(key, service);
  }

  get<K extends keyof ServiceMap>(key: K): ServiceMap[K];
  get<T>(key: string): T;
  get(key: string): any {
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
