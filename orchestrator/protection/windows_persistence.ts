import { commandManager } from "../command_manager.ts";
import { PersistenceProvider, PersistenceAuditResult } from "./interfaces.ts";

export class WindowsPersistenceProvider implements PersistenceProvider {
  async auditPersistence(): Promise<PersistenceAuditResult> {
    const psCommand = `
      $anomalies = @()
      # Audit Run keys
      $runKeys = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
      # Audit Scheduled Tasks
      $tasks = Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\\Microsoft*' }

      # Logic to identify anomalies goes here
      return $anomalies | ConvertTo-Json
    `;

    try {
      const result = await commandManager.execute("powershell", ["-Command", psCommand]);
      return {
        success: result.success,
        anomalies: result.data || [],
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      return { success: false, anomalies: [], timestamp: new Date().toISOString() };
    }
  }
}
