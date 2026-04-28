import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export interface AuditEvent {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    data?: any;
}

export class AuditService {
    constructor(private kv: Deno.Kv, private logging: LoggingPort) {}

    async logEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { timestamp?: string }) {
        const id = crypto.randomUUID();
        const timestamp = event.timestamp || new Date().toISOString();
        const auditEvent: AuditEvent = { ...event, id, timestamp };

        try {
            await this.kv.set(["audit", Date.now(), id], auditEvent);
            // Forward audit event to remote syslog (Phase 2 Requirement)
            this.logging.log(`[AUDIT] ${auditEvent.type}: ${auditEvent.message}`, SyslogSeverity.NOTICE);
        } catch (e) {
            console.error("[AUDIT] Failed to save event:", e);
        }
    }

    async getRecentEvents(limit: number = 50): Promise<AuditEvent[]> {
        const events: AuditEvent[] = [];
        const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { reverse: true, limit });

        for await (const entry of entries) {
            events.push(entry.value);
        }

        return events;
    }
}

