import { PersistenceProvider, PersistenceAuditResult } from "../interfaces.ts";
export type { PersistenceProvider, PersistenceAuditResult };

export class PersistenceManager {
  constructor(private provider: PersistenceProvider) {}

  async audit(): Promise<PersistenceAuditResult> {
    return await this.provider.auditPersistence();
  }
}
