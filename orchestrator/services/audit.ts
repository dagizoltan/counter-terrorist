export interface AuditEvent {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    data?: any;
}

export class AuditService {
    private kv: Deno.Kv | null = null;

    constructor() {
        this.initKv();
    }

    private async initKv() {
        try {
            this.kv = await Deno.openKv();
        } catch (e) {
            console.error("[AUDIT] Failed to initialize Deno KV:", e);
        }
    }

    async logEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { timestamp?: string }) {
        if (!this.kv) {
            await this.initKv();
        }
        if (!this.kv) {
            console.error("[AUDIT] Cannot log event, KV not initialized.");
            return;
        }

        const id = crypto.randomUUID();
        const timestamp = event.timestamp || new Date().toISOString();
        const auditEvent: AuditEvent = { ...event, id, timestamp };

        try {
            await this.kv.set(["audit", Date.now(), id], auditEvent);
        } catch (e) {
            console.error("[AUDIT] Failed to save event:", e);
        }
    }

    async getRecentEvents(limit: number = 50): Promise<AuditEvent[]> {
        if (!this.kv) {
            await this.initKv();
        }
        if (!this.kv) {
            return [];
        }

        const events: AuditEvent[] = [];
        const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { reverse: true, limit });

        for await (const entry of entries) {
            events.push(entry.value);
        }

        return events;
    }
}

export const auditService = new AuditService();
