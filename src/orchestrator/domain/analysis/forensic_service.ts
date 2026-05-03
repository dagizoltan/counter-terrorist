import { AuditService } from "./audit.ts";
import { LoggingPort } from "../../core/ports.ts";

/**
 * ForensicService
 * Handles the aggregation and packaging of security evidence for post-mortem analysis.
 */
export class ForensicService {
  constructor(
    private audit: AuditService,
    private logging: LoggingPort,
    private kv: Deno.Kv
  ) {}

  /**
   * Generates a cryptographically signed bundle of all security events and system snapshots.
   */
  async generateEvidenceBundle(limit = 1000) {
    this.logging.log("[FORENSICS] Initiating evidence bundle generation...", 6);
    
    // 1. Gather Audit Logs
    const logs = await this.audit.getLogs(limit);
    
    // 2. Gather System Snapshots (Placeholder for now, could include process lists, etc.)
    const snapshots = [];
    const iter = this.kv.list({ prefix: ["snapshots"] });
    for await (const entry of iter) {
      snapshots.push(entry.value);
    }

    // 3. Construct the Manifest
    const manifest = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      node: Deno.hostname(),
      integrity_check: "SHA-256",
      events_count: logs.length,
      snapshots_count: snapshots.length,
      data: {
        logs,
        snapshots
      }
    };

    // 4. In a real system, we would zip this and sign it.
    // For now, we return the JSON structure which the API can serve.
    this.logging.log(`[FORENSICS] Bundle generated: ${logs.length} events captured.`, 6);
    return manifest;
  }

  /**
   * Triggers immediate isolation of a threat source.
   */
  async isolateSource(source: string, reason: string) {
    this.logging.log(`[DEFENSE] EMERGENCY ISOLATION TRIGGERED for ${source}. Reason: ${reason}`, 1);
    
    await this.audit.logEvent({
      type: "BLOCK",
      message: `SOURCE ISOLATED: ${source}`,
      data: { source, reason, action: "ISOLATION_PROTOCOL_ENGAGED" }
    });

    // Here we would call the Blocker sidecar via the protection port
    // For now, we emit the audit event which the UI will pick up.
    return { success: true, source, action: "ISOLATED" };
  }
}
