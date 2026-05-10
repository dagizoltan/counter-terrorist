import { PersistenceProvider } from "../persistence.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class MacosPersistenceProvider implements PersistenceProvider {
  constructor(private executor: SystemExecutor) {}

  async audit(): Promise<{ success: boolean; anomalies: any[]; timestamp: string }> {
    // macOS uses launchctl for persistence
    const res = await this.executor.execute("launchctl", ["list"]);
    return { success: res.success, anomalies: [], timestamp: new Date().toISOString() };
  }
}
