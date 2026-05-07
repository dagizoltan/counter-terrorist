import { NetworkLogRepository, NetworkLogEntry } from "@domain/repositories/network_log_repository.ts";
import { TimelineRepository } from "../repositories/timeline_repository.ts";

export class KvNetworkLogRepository implements NetworkLogRepository {
    private repo: TimelineRepository<NetworkLogEntry & { id: string; timestamp: string }>;

    constructor(kv: Deno.Kv) {
        this.repo = new TimelineRepository<NetworkLogEntry & { id: string; timestamp: string }>(kv, "network_logs");
    }

    async save(entry: NetworkLogEntry): Promise<void> {
        const id = crypto.randomUUID();
        const timestamp = entry.timestamp || new Date().toISOString();
        await this.repo.set(id, { ...entry, id, timestamp });
    }

    async getLatest(limit: number): Promise<NetworkLogEntry[]> {
        return await this.repo.getLatest(limit);
    }
}
