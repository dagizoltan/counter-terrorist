import { 
  AuditService, 
  NotificationService, 
  BaselineService, 
  ProcessTracker, 
  SessionService, 
  ApiKeysService, 
  HoneypotService,
  AutopilotService,
  MorphingService,
  ChaosEngine,
  SupplyChainService,
  MeshManager,
  EventBus,
  MeshAuthService,
  ThreatIntelService
} from "@domain/index.ts";
import { ConfigurationPort, ProtectionPort, CommandPort } from "./ports.ts";
import { ComplianceService } from "../domain/analysis/compliance_service.ts";

export interface ServiceContainer {
  config: ConfigurationPort;
  protection: ProtectionPort;
  command: CommandPort;
  audit: AuditService;
  notifications: NotificationService;
  baseline: BaselineService;
  processTracker: ProcessTracker;
  sessions: SessionService;
  apiKeys: ApiKeysService;
  eventBus: EventBus;
  honeypot: HoneypotService;
  autopilot: AutopilotService;
  morphing: MorphingService;
  chaos: ChaosEngine;
  supplyChain: SupplyChainService;
  mesh: MeshManager;
  meshAuth: MeshAuthService;
  threatIntel: ThreatIntelService;
  compliance: ComplianceService;
  anonymization: any;
  deceptionGrid: any;
  shadowProtocol: any;
  curatedIntel: any;
  news: any;
  networkDiscovery: any;
  networkLogs: any;
  incidents: any;
  platformInfo: any;
}
