import { PersistenceProvider, PersistenceAuditResult } from "../persistence.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class WindowsPersistenceProvider implements PersistenceProvider {
  constructor(private executor: SystemExecutor) {}

  async auditPersistence(): Promise<PersistenceAuditResult> {
    const result = await this.executor.execute("powershell", ["-Command", "Get-CimInstance Win32_StartupCommand"]);
    return {
      success: result.success,
      anomalies: [],
      timestamp: new Date().toISOString()
    };
  }
}
