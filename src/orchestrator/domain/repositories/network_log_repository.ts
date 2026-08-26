// Single definition, in core/ports alongside LogEntry: the logging port and
// this repository must agree on the shape, and two copies had already drifted
// — the port's records carry action "SHADOW", which this one did not allow.
export type { NetworkLogEntry } from "@core/ports.ts";
import type { NetworkLogEntry } from "@core/ports.ts";

export interface NetworkLogRepository {
    save(entry: NetworkLogEntry): Promise<void>;
    getLatest(limit: number): Promise<NetworkLogEntry[]>;
}
