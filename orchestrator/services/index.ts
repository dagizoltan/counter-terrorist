// Infrastructure (Re-exports for convenience)
export { CommandManager } from "../../infrastructure/system/command_manager.ts";
export { getPlatformInfo } from "../../infrastructure/system/platform.ts";
export { LoggingService, SyslogSeverity } from "../../infrastructure/system/logging.ts";

// Access Domain
export { ApiKeysService } from "./access/api_keys.ts";
export { SessionService } from "./access/session.ts";
export { MeshAuthService } from "./access/mesh_auth.ts";

// Defense Domain
export { HoneypotService } from "./defense/honeypot_service.ts";
export { CanaryService } from "./defense/canary_service.ts";

// Forensics Domain
export { AuditService } from "./forensics/audit.ts";
export { EventBus } from "./forensics/events.ts";
export { ProcessTracker } from "./forensics/process_tracker.ts";
export { BaselineService } from "./forensics/baseline.ts";
export { MetricsService } from "./forensics/metrics_service.ts";
export { SupplyChainService } from "./forensics/supply_chain.ts";

// Orchestration Domain
export { MeshManager } from "./orchestration/mesh.ts";
export { PlaybookService } from "./orchestration/playbook_service.ts";
export { AutopilotService } from "./orchestration/autopilot_service.ts";
export { pluginManager } from "./orchestration/plugin_manager.ts";
export { NotificationService } from "./orchestration/alerts.ts";

// Types
export type { Role } from "./access/api_keys.ts";
