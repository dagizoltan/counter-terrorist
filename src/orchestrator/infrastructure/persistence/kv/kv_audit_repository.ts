import { AuditRepository } from "@domain/repositories/audit_repository.ts";
import { AuditEvent } from "@domain/analysis/audit.ts";
import { TimelineRepository } from "../repositories/timeline_repository.ts";

export class KvAuditRepository implements AuditRepository {
    private repo: TimelineRepository<AuditEvent>;

    constructor(kv: Deno.Kv) {
        this.repo = new TimelineRepository<AuditEvent>(kv, "audit");
    }

    async save(event: AuditEvent): Promise<void> {
        await this.repo.set(event.id, event);
    }

    async getLatest(limit: number): Promise<AuditEvent[]> {
        return await this.repo.getLatest(limit);
    }

    async deleteBefore(timestamp: number): Promise<number> {
        return await this.repo.deleteBefore(timestamp);
    }

    async count(): Promise<number> {
        return await this.repo.count();
    }

    async *getStream(limit: number, reverse: boolean): AsyncIterable<AuditEvent> {
        const iter = (this.repo as any).kv.list({ prefix: ["audit"] }, { limit, reverse });
        for await (const entry of iter) {
            yield entry.value as AuditEvent;
        }
    }
}
