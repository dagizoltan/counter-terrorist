import { Result } from "./result.ts";
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
  ThreatIntelService,
  ComplianceService,
  AnonymizationService,
  DeceptionGridService,
  ShadowProtocolService,
  CuratedIntelService,
  NewsSignalService,
  NetworkDiscoveryService,
  NetworkLogService,
  IncidentService,
  CanaryService,
  KernelService,
  ForensicService,
  PlaybookService,
  CovertChannelService,
  LedgerService,
  HealthService,
  EventMediator,
  BehavioralService,
  GeoIpService,
  ShadowService,
  PolicyEngine,
  RateLimitService,
  CorrelationService,
  ViewModelService
} from "@domain/index.ts";
import { ConfigurationPort, ProtectionPort, CommandPort, MeshAuthPort, TpmPort } from "./ports.ts";

import { PlatformName } from "@infrastructure/system/platform.ts";
import { LoggingPort } from "./ports.ts";
import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { AutonomousAutopilotService } from "@domain/analysis/autonomous_autopilot_service.ts";

export interface PlatformInfo {
  name: PlatformName;
  version: string;
  tag: string;
  isRoot: boolean;
  tpm?: { available: boolean; pcrs: Record<number, string> };
  metrics?: any;
}

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
  autonomousAutopilot: AutonomousAutopilotService;
  lifecycle: LifecycleService;
  logging: LoggingPort;
  playbook: PlaybookService;
  morphing: MorphingService;
  chaos: ChaosEngine;
  supplyChain: SupplyChainService;
  mesh: MeshManager;
  meshAuth: MeshAuthPort;
  threatIntel: ThreatIntelService;
  compliance: ComplianceService;
  anonymization: AnonymizationService;
  shadowProtocol: ShadowProtocolService;
  deceptionGrid: DeceptionGridService;
  curatedIntel: CuratedIntelService;
  news: NewsSignalService;
  networkDiscovery: NetworkDiscoveryService;
  networkLogs: NetworkLogService;
  provisioning: ProvisioningService;
  incidents: IncidentService;
  canaryService: CanaryService;
  kernelService: KernelService;
  forensicService: ForensicService;
  integrity: IntegrityService;
  shadow: ShadowService;
  covert: CovertChannelService;
  ledger: LedgerService;
  tpm: TpmPort;
  policy: PolicyEngine;
  health: HealthService;
  metrics: any;
  mediator: EventMediator;
  behavioral: BehavioralService;
  geoIp: GeoIpService;
  correlation: CorrelationService;
  rateLimit: RateLimitService;
  platformInfo: PlatformInfo;
  viewModel: ViewModelService;
}
