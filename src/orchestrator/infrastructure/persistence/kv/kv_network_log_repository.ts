import { NetworkLogRepository, NetworkLogEntry } from "@domain/repositories/network_log_repository.ts";
import { TimelineRepository } from "../repositories/timeline_repository.ts";

export class KvNetworkLogRepository extends TimelineRepository<NetworkLogEntry & { id: string; timestamp: string }> implements NetworkLogRepository {
    constructor(kv: Deno.Kv) {
        super(kv, "network_logs");
    }

    async save(entry: NetworkLogEntry): Promise<void> {
        const id = crypto.randomUUID();
        const timestamp = entry.timestamp || new Date().toISOString();
        // H-12: Implement 7-day retention for network logs to prevent unbounded KV growth
        const expireIn = 7 * 24 * 60 * 60 * 1000;

        const ts = new Date(timestamp).getTime();
        await this.kv.atomic()
            .set([this.prefix, ts, id], { ...entry, id, timestamp }, { expireIn })
            .mutate({ type: "sum", key: ["stats", this.prefix, "count"], value: new Deno.KvU64(1n) })
            .commit();
    }
}
