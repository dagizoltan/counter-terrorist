import { NetworkLogRepository, NetworkLogEntry } from "@domain/repositories/network_log_repository.ts";
import { TimelineRepository } from "../repositories/timeline_repository.ts";

export class KvNetworkLogRepository extends TimelineRepository<NetworkLogEntry & { id: string; timestamp: string }> implements NetworkLogRepository {
    constructor(kv: Deno.Kv) {
        super(kv, "network_logs");
    }

    async save(entry: NetworkLogEntry): Promise<void> {
        const id = crypto.randomUUID();
        const timestamp = entry.timestamp || new Date().toISOString();
        await this.set(id, { ...entry, id, timestamp });
    }
}
