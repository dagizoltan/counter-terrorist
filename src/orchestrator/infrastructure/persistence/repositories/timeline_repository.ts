import { KvRepository } from "./kv_repository.ts";

/**
 * A repository that stores items with a timestamp in the key for chronological access.
 * Key format: [prefix, timestamp, id]
 */
export class TimelineRepository<T extends { id: string; timestamp: string | number }> extends KvRepository<T> {
  override async set(id: string, data: T): Promise<void> {
    const ts = typeof data.timestamp === "string" ? new Date(data.timestamp).getTime() : data.timestamp;
    
    // Atomic set + counter increment
    const res = await this.kv.atomic()
        .set([this.prefix, ts, id], data)
        .mutate({ type: "sum", key: ["stats", this.prefix, "count"], value: new Deno.KvU64(1n) })
        .commit();
    
    if (!res.ok) throw new Error(`Failed to set timeline entry for ${id}`);
  }

  async getLatest(limit: number = 1): Promise<T[]> {
    const iter = this.kv.list<T>({ prefix: [this.prefix] }, { reverse: true, limit });
    const items: T[] = [];
    for await (const entry of iter) {
      items.push(entry.value);
    }
    return items;
  }

  async listRange(startTs: number, endTs: number): Promise<T[]> {
    const iter = this.kv.list<T>({ 
      start: [this.prefix, startTs], 
      end: [this.prefix, endTs] 
    });
    const items: T[] = [];
    for await (const entry of iter) {
      items.push(entry.value);
    }
    return items;
  }

  async deleteBefore(timestamp: number): Promise<number> {
    const iter = this.kv.list<T>({ prefix: [this.prefix], end: [this.prefix, timestamp] });
    let count = 0;
    let atomic = this.kv.atomic();
    let batchSize = 0;

    for await (const entry of iter) {
      atomic = atomic.delete(entry.key);
      count++;
      batchSize++;

      if (batchSize >= 10) {
        await atomic.mutate({ type: "sum", key: ["stats", this.prefix, "count"], value: new Deno.KvU64(BigInt(-batchSize)) })
              .commit();
        atomic = this.kv.atomic();
        batchSize = 0;
      }
    }

    if (batchSize > 0) {
      await atomic.mutate({ type: "sum", key: ["stats", this.prefix, "count"], value: new Deno.KvU64(BigInt(-batchSize)) })
            .commit();
    }

    return count;
  }
  
  async count(): Promise<number> {
    const res = await this.kv.get<Deno.KvU64>(["stats", this.prefix, "count"]);
    if (res.value) {
        return Number(res.value.value);
    }
    
    // Fallback: recount once and initialize (heavy, but self-healing)
    let count = 0;
    const iter = this.kv.list({ prefix: [this.prefix] });
    for await (const _ of iter) {
      count++;
    }
    await this.kv.set(["stats", this.prefix, "count"], new Deno.KvU64(BigInt(count)));
    return count;
  }

  async *getStream(limit?: number, reverse?: boolean): AsyncIterable<T> {
    const iter = this.kv.list<T>({ prefix: [this.prefix] }, { limit, reverse });
    for await (const entry of iter) {
      yield entry.value;
    }
  }
}
