import { AuditEvent, AuditDelta } from "../analysis/audit.ts";

export interface AuditRepository {
    save(event: AuditEvent): Promise<void>;
    saveMany(events: AuditEvent[]): Promise<void>;
    getLatest(limit: number): Promise<AuditEvent[]>;
    deleteBefore(timestamp: number): Promise<number>;
    count(): Promise<number>;
    getStream(limit: number, reverse: boolean): AsyncIterable<AuditEvent>;

    // Event Sourcing Support
    appendDelta(delta: AuditDelta): Promise<void>;
    getDeltas(eventId: string): Promise<AuditDelta[]>;
}
