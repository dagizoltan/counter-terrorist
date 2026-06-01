import { ServiceContainer } from "./container.ts";
import { AuditService } from "../domain/analysis/audit.ts";
import { HealthService } from "../domain/analysis/health_service.ts";
import { ComplianceService } from "../domain/analysis/compliance_service.ts";
import { PolicyEngine } from "../domain/orchestration/policy_engine.ts";
import { LedgerService } from "../domain/analysis/ledger_service.ts";
import { CuratedIntelService } from "../domain/analysis/curated_intel_service.ts";
import { NewsSignalService } from "../domain/analysis/news_signal_service.ts";
import { NetworkDiscoveryService } from "../domain/analysis/network_discovery.ts";
import { ForensicService } from "../domain/analysis/forensic_service.ts";
import { BehavioralService } from "../domain/analysis/behavioral_service.ts";
import { ProtectionPort } from "./ports.ts";
import { HoneypotService } from "../domain/protection/honeypot_service.ts";
import { CanaryService } from "../domain/protection/canary_service.ts";
import { AutopilotService } from "../domain/orchestration/autopilot_service.ts";
import { PlaybookService } from "../domain/orchestration/playbook_service.ts";

/**
 * Sovereign Subsystem Architecture
 * Groups related services into functional blocks for high-fidelity orchestration.
 */
export interface OperationalSubsystems {
  overwatch: {
    audit: AuditService;
    health: HealthService;
    compliance: ComplianceService;
    governance: PolicyEngine;
    ledger: LedgerService;
  };
  signal: {
    intelligence: CuratedIntelService;
    news: NewsSignalService;
    discovery: NetworkDiscoveryService;
    forensics: ForensicService;
    behavioral: BehavioralService;
  };
  strike: {
    protection: ProtectionPort;
    honeypot: HoneypotService;
    canary: CanaryService;
    autopilot: AutopilotService;
    playbook: PlaybookService;
  };
}

/**
 * Subsystem Composer
 * Authoritative factory for multi-service hydration.
 */
export class SubsystemComposer {
  static async hydrate(container: ServiceContainer): Promise<OperationalSubsystems> {
    return {
      overwatch: {
        audit: container.audit,
        health: container.health,
        compliance: container.compliance,
        governance: container.policy,
        ledger: container.ledger
      },
      signal: {
        intelligence: container.curatedIntel,
        news: container.news,
        discovery: container.networkDiscovery,
        forensics: container.forensicService,
        behavioral: container.behavioral
      },
      strike: {
        protection: container.protection,
        honeypot: container.honeypot,
        canary: container.canaryService,
        autopilot: container.autopilot,
        playbook: container.playbook
      }
    };
  }
}
