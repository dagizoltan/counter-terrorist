import { commandManager } from "../services/command_manager.ts";
import { PersistenceProvider, PersistenceAuditResult } from "./interfaces.ts";

export class WindowsPersistenceProvider implements PersistenceProvider {
  async auditPersistence(): Promise<PersistenceAuditResult> {
    const psCommand = `
      $anomalies = @()
      $runPaths = @(
        "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
        "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
        "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
      )

      foreach ($path in $runPaths) {
        if (Test-Path $path) {
          $properties = Get-ItemProperty -Path $path
          foreach ($name in $properties.PSObject.Properties.Name) {
            if ($name -match "^(PSPath|PSParentPath|PSChildName|PSDrive|PSProvider|PSIsContainer)$") { continue }
            $val = $properties.$name.ToString()

            # Extract path from command line
            $execPath = $val
            if ($val -match '^"([^"]+)"') {
                $execPath = $matches[1]
            } elseif ($val -match '^([^\\s]+)') {
                $execPath = $matches[1]
            }

            $anomaly = $null
            if (!(Test-Path $execPath)) {
                $anomaly = @{ type="RunKey"; name=$name; path=$val; reason="File does not exist" }
            } elseif ($execPath -match "Temp") {
                $anomaly = @{ type="RunKey"; name=$name; path=$val; reason="Path contains Temp directory" }
            }

            if ($anomaly) { $anomalies += $anomaly }
          }
        }
      }

      # Audit Scheduled Tasks
      $tasks = Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\\Microsoft*' }
      foreach ($task in $tasks) {
        foreach ($action in $task.Actions) {
          if ($action.Execute) {
            $execPath = $action.Execute
            if (!(Test-Path $execPath)) {
                $anomalies += @{ type="ScheduledTask"; name=$task.TaskName; path=$execPath; reason="Executable does not exist" }
            } elseif ($execPath -match "Temp") {
                $anomalies += @{ type="ScheduledTask"; name=$task.TaskName; path=$execPath; reason="Path contains Temp directory" }
            }
          }
          if ($action.Arguments -and $action.Arguments -match "powershell.exe" -and $action.Arguments -match "-EncodedCommand") {
             $anomalies += @{ type="ScheduledTask"; name=$task.TaskName; path=$action.Arguments; reason="PowerShell EncodedCommand detected" }
          }
        }
      }

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
