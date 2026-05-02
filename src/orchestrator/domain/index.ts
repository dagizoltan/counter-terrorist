// Infrastructure (Re-exports for convenience)
export * from "@infrastructure/system/command_manager.ts";
export { getPlatformInfo } from "@infrastructure/system/platform.ts";
export { LoggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";

// Identity Domain
export { ApiKeysService } from "./identity/api_keys.ts";
export { SessionService } from "./identity/session.ts";
export { MeshAuthService } from "./identity/mesh_auth.ts";

// Protection Domain
export { HoneypotService } from "./protection/honeypot_service.ts";
export { CanaryService } from "./protection/canary_service.ts";
export { MorphingService } from "./protection/morphing_service.ts";
export { KernelService } from "./protection/kernel_service.ts";
export { ThreatIntelService } from "./protection/threat_intel.ts";
export { AnonymizationService } from "./protection/anonymization_service.ts";
export { DeceptionGridService } from "./protection/deception_grid.ts";
export { ShadowProtocolService } from "./protection/shadow_protocol_service.ts";

// Analysis Domain
export { AuditService } from "./analysis/audit.ts";
export { EventBus } from "./analysis/events.ts";
export { ProcessTracker } from "./analysis/process_tracker.ts";
export { BaselineService } from "./analysis/baseline.ts";
export { MetricsService } from "./analysis/metrics_service.ts";
export { SupplyChainService } from "./analysis/supply_chain.ts";
export { NotificationService } from "./analysis/notifications.ts";

// Engine Domain
export { MeshManager } from "./engine/mesh.ts";
export { PlaybookService } from "./engine/playbook_service.ts";
export { AutopilotService } from "./engine/autopilot_service.ts";
export { ChaosEngine } from "./engine/chaos_engine.ts";
export { pluginManager } from "./engine/plugin_manager.ts";
export { GovernanceService } from "./engine/governance_service.ts";
export { CovertChannelService } from "./engine/covert_service.ts";

// Analysis Domain Additions
export { LedgerService } from "./analysis/ledger_service.ts";

// Protection Domain Additions
export { ShadowService } from "./protection/shadow_service.ts";

// Types
export type { Role } from "./identity/api_keys.ts";
