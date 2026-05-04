import { ServiceContainer } from "./container.ts";

/**
 * Sovereign Subsystem Architecture
 * Groups related services into functional blocks for high-fidelity orchestration.
 */
export interface OperationalSubsystems {
  overwatch: {
    audit: any;
    health: any;
    compliance: any;
    governance: any;
    ledger: any;
  };
  signal: {
    intelligence: any;
    news: any;
    discovery: any;
    forensics: any;
    behavioral: any;
  };
  strike: {
    protection: any;
    honeypot: any;
    canary: any;
    autopilot: any;
    playbook: any;
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
        governance: container.governance,
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
