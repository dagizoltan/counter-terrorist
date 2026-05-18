import { SessionRepository } from "@domain/repositories/session_repository.ts";
import { Session } from "@domain/identity/session.ts";
import { KvRepository } from "../repositories/kv_repository.ts";

export class KvSessionRepository extends KvRepository<Session> implements SessionRepository {
    constructor(kv: Deno.Kv) {
        super(kv, "session");
    }

    async save(session: Session): Promise<void> {
        await this.set(session.id, session);
    }

    async getById(id: string): Promise<Session | null> {
        return await this.get(id);
    }

    async *listAll(): AsyncIterable<Session> {
        const items = await this.list();
        for (const item of items) {
            yield item;
        }
    }
}
