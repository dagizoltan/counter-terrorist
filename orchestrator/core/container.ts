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
  EventBus
} from "../services/index.ts";
import { ConfigurationPort, ProtectionPort, CommandPort } from "./ports.ts";

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
  platformInfo: any;
}
