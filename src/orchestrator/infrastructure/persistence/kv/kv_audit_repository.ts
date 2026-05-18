import { AuditRepository } from "@domain/repositories/audit_repository.ts";
import { AuditEvent } from "@domain/analysis/audit.ts";
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
}
