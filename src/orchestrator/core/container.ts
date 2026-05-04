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
  GeoIpService
} from "@domain/index.ts";
import { ConfigurationPort, ProtectionPort, CommandPort } from "./ports.ts";
import { TPMManager } from "../infrastructure/system/protection/tpm/tpm_manager.ts";

import { PlatformName } from "@infrastructure/system/platform.ts";

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
  playbook: PlaybookService;
  morphing: MorphingService;
  chaos: ChaosEngine;
  supplyChain: SupplyChainService;
  mesh: MeshManager;
  meshAuth: MeshAuthService;
  threatIntel: ThreatIntelService;
  compliance: ComplianceService;
  anonymization: AnonymizationService;
  shadowProtocol: ShadowProtocolService;
  deceptionGrid: DeceptionGridService;
  curatedIntel: CuratedIntelService;
  news: NewsSignalService;
  networkDiscovery: NetworkDiscoveryService;
  networkLogs: NetworkLogService;
  incidents: IncidentService;
  canaryService: CanaryService;
  kernelService: KernelService;
  forensicService: ForensicService;
  shadow: any; // ShadowService
  covert: CovertChannelService;
  ledger: LedgerService;
  tpm: TPMManager;
  policy: any; // PolicyEngine
  health: HealthService;
  mediator: EventMediator;
  behavioral: BehavioralService;
  geoIp: GeoIpService;
  rateLimit: any; // RateLimitService
  platformInfo: PlatformInfo;
}
