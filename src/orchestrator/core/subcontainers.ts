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
  CorrelationService
} from "@domain/index.ts";
import { ConfigurationPort, ProtectionPort, CommandPort, LoggingPort } from "./ports.ts";
import { TPMManager } from "../infrastructure/system/protection/tpm/tpm_manager.ts";
import { PlatformInfo } from "./container.ts";
import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { AutonomousAutopilotService } from "@domain/analysis/autonomous_autopilot_service.ts";

export interface CoreInfrastructure {
  config: ConfigurationPort;
  logging: LoggingPort;
  command: CommandPort;
  tpm: TPMManager;
  eventBus: EventBus;
  health: HealthService;
  platformInfo: PlatformInfo;
}

export interface SecuritySubsystem {
  protection: ProtectionPort;
  anonymization: AnonymizationService;
  shadowProtocol: ShadowProtocolService;
  behavioral: BehavioralService;
  honeypot: HoneypotService;
  canaryService: CanaryService;
  kernelService: KernelService;
  deceptionGrid: DeceptionGridService;
}

export interface IntelligenceSubsystem {
  threatIntel: ThreatIntelService;
  curatedIntel: CuratedIntelService;
  geoIp: GeoIpService;
  forensicService: ForensicService;
  news: NewsSignalService;
  networkDiscovery: NetworkDiscoveryService;
  networkLogs: NetworkLogService;
  incidents: IncidentService;
  compliance: ComplianceService;
}

export interface EngineSubsystem {
  autopilot: AutopilotService;
  autonomousAutopilot: AutonomousAutopilotService;
  lifecycle: LifecycleService;
  playbook: PlaybookService;
  morphing: MorphingService;
  chaos: ChaosEngine;
  supplyChain: SupplyChainService;
  policy: PolicyEngine;
  correlation: CorrelationService;
  mediator: EventMediator;
}

export interface MeshSubsystem {
  mesh: MeshManager;
  meshAuth: MeshAuthService;
  ledger: LedgerService;
}

export interface IdentitySubsystem {
  sessions: SessionService;
  apiKeys: ApiKeysService;
  rateLimit: RateLimitService;
}
