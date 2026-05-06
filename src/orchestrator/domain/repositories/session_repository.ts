import { Session } from "../identity/session.ts";

export interface SessionRepository {
    save(session: Session): Promise<void>;
    getById(id: string): Promise<Session | null>;
    delete(id: string): Promise<void>;
    listAll(): AsyncIterable<Session>;
}
