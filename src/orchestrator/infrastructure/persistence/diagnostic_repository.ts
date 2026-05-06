import { LoggingPort, LogSeverity, LogType, LogEntry } from "@core/ports.ts";
import { TimelineRepository } from "./repositories/timeline_repository.ts";

/**
 * DiagnosticRepository
 * Handles high-frequency system logs in Deno KV with automatic TTL.
 */
export class DiagnosticRepository {
  private repo: TimelineRepository<LogEntry & { id: string }>;
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private kv: Deno.Kv) {
    this.repo = new TimelineRepository<LogEntry & { id: string }>(kv, "logs");
  }

  async addLog(entry: LogEntry): Promise<void> {
    const id = crypto.randomUUID();
    const data = { ...entry, id };
    
    // Use expireIn for automatic pruning of diagnostic noise
    await this.kv.set(["logs", new Date(entry.timestamp).getTime(), id], data, { 
      expireIn: this.DEFAULT_TTL 
    });
    
    // Update stats counter
    await this.kv.atomic()
      .mutate({ type: "sum", key: ["stats", "logs", "count"], value: new Deno.KvU64(1n) })
      .commit();
  }

  async getRecent(limit: number = 100): Promise<LogEntry[]> {
    return await this.repo.getLatest(limit);
  }

  async clear(): Promise<void> {
    const iter = this.kv.list({ prefix: ["logs"] });
    for await (const entry of iter) {
      await this.kv.delete(entry.key);
    }
    await this.kv.set(["stats", "logs", "count"], new Deno.KvU64(0n));
  }
}
