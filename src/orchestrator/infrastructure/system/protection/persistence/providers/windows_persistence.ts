import { PersistenceProvider, PersistenceAuditResult } from "../persistence.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export class WindowsPersistenceProvider implements PersistenceProvider {
  constructor(private executor: SystemExecutor) {}

  async auditPersistence(): Promise<PersistenceAuditResult> {
    // SECURITY: Use EncodedCommand to prevent shell injection and handle special characters
    const script = `
      $anomalies = @()
      try {
        $startup = Get-CimInstance Win32_StartupCommand -ErrorAction Stop
        $startup | ConvertTo-Json
      } catch {
        Write-Error $_.Exception.Message
      }
    `;
    const encodedScript = btoa(new TextEncoder().encode(script).reduce((data, byte) => data + String.fromCharCode(byte), ""));
    // Note: PowerShell expects UTF-16LE for EncodedCommand, but since we are doing simple ASCII here,
    // we need to be careful. Actually, Deno's btoa works on strings.
    // For standard PowerShell usage:
    const utf16Bytes = new Uint16Array(script.length);
    for (let i = 0; i < script.length; i++) utf16Bytes[i] = script.charCodeAt(i);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(utf16Bytes.buffer)));

    const result = await this.executor.execute("powershell", ["-EncodedCommand", base64]);
    return {
      success: result.success,
      anomalies: [],
      timestamp: new Date().toISOString()
    };
  }
}
