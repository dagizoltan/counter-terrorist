import { PersistenceProvider, PersistenceAuditResult } from "../persistence.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class UbuntuPersistenceProvider implements PersistenceProvider {
  constructor(private executor: SystemExecutor) {}

  async auditPersistence(): Promise<PersistenceAuditResult> {
    const result = await this.executor.execute("ls", ["-la", "/etc/cron.d"]);
    return {
      success: result.success,
      anomalies: [],
      timestamp: new Date().toISOString()
    };
  }
}
