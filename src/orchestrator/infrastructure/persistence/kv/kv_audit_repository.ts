import { AuditRepository } from "@domain/repositories/audit_repository.ts";
import { AuditEvent, AuditDelta } from "@domain/analysis/audit.ts";
import { TimelineRepository } from "../repositories/timeline_repository.ts";

export class KvAuditRepository extends TimelineRepository<AuditEvent> implements AuditRepository {
    constructor(kv: Deno.Kv) {
        super(kv, "audit");
    }

    async save(event: AuditEvent): Promise<void> {
        await this.set(event.id, event);
    }

    override async saveMany(events: AuditEvent[]): Promise<void> {
        await this.setMany(events.map(e => ({ id: e.id, data: e })));
    }

    async appendDelta(delta: AuditDelta): Promise<void> {
        await this.kv.set(["audit", "deltas", delta.eventId, delta.timestamp, delta.id], delta);
    }

    async getDeltas(eventId: string): Promise<AuditDelta[]> {
        const iter = this.kv.list<AuditDelta>({ prefix: ["audit", "deltas", eventId] });
        const deltas: AuditDelta[] = [];
        for await (const entry of iter) {
            deltas.push(entry.value);
        }
        return deltas;
    }
}
