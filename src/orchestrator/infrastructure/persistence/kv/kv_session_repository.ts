import { SessionRepository } from "@domain/repositories/session_repository.ts";
import { Session } from "@domain/identity/session.ts";

export class KvSessionRepository implements SessionRepository {
    private prefix = "session";

    constructor(private kv: Deno.Kv) {}

    async save(session: Session): Promise<void> {
        await this.kv.set([this.prefix, session.id], session);
    }

    async getById(id: string): Promise<Session | null> {
        const res = await this.kv.get<Session>([this.prefix, id]);
        return res.value;
    }

    async delete(id: string): Promise<void> {
        await this.kv.delete([this.prefix, id]);
    }

    async *listAll(): AsyncIterable<Session> {
        const iter = this.kv.list<Session>({ prefix: [this.prefix] });
        for await (const entry of iter) {
            yield entry.value;
        }
    }
}
