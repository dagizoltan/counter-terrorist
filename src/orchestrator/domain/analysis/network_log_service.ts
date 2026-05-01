import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { TimelineRepository } from "@infrastructure/persistence/repositories/timeline_repository.ts";

export interface NetworkLog {
    id: string;
    timestamp: string;
    direction: "INBOUND" | "OUTBOUND";
    source: string;
    destination: string;
    protocol: string;
    length: number;
    action: "ALLOW" | "BLOCK" | "SHADOW";
}

export class NetworkLogService {
    private repo: TimelineRepository<NetworkLog>;

    constructor(private kv: Deno.Kv, private logging: LoggingPort) {
        this.repo = new TimelineRepository<NetworkLog>(kv, "network_logs");
    }

    async log(log: Omit<NetworkLog, "id" | "timestamp">) {
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const entry: NetworkLog = { ...log, id, timestamp };
        
        await this.repo.set(id, entry);
        
        // Retention: 7 days
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.repo.deleteBefore(sevenDaysAgo).catch(() => {});
    }

    async getLogs(limit = 100): Promise<NetworkLog[]> {
        return await this.repo.getLatest(limit);
    }
}
