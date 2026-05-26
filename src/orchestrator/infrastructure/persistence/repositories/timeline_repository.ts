import { KvRepository } from "./kv_repository.ts";

/**
 * A repository that stores items with a timestamp in the key for chronological access.
 * Key format: [prefix, timestamp, id]
 */
export class TimelineRepository<T extends { id: string; timestamp: string | number }> extends KvRepository<T> {
  override async set(id: string, data: T): Promise<void> {
    this.checkWritePermission();
    const ts = typeof data.timestamp === "string" ? new Date(data.timestamp).getTime() : data.timestamp;
    
    // Atomic set + counter increment
    const res = await this.kv.atomic()
        .set([this.prefix, ts, id], data)
        .mutate({ type: "sum", key: ["stats", this.prefix, "count"], value: new Deno.KvU64(1n) })
        .commit();
    
    if (!res.ok) throw new Error(`Failed to set timeline entry for ${id}`);
  }

  async setMany(items: { id: string, data: T }[]): Promise<void> {
    if (items.length === 0) return;
    this.checkWritePermission();

    // SOV-P5: Transactional Batching with Chunking
    // Deno KV atomic transactions have a limit on the number of mutations (around 1000).
    // We chunk large batches into smaller atomic units to ensure reliability.
    const CHUNK_SIZE = 100;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        let atomic = this.kv.atomic();
        let count = 0;

        for (const item of chunk) {
            const ts = typeof item.data.timestamp === "string" ? new Date(item.data.timestamp).getTime() : item.data.timestamp;
            atomic = atomic.set([this.prefix, ts, item.id], item.data);
            count++;
        }

        const res = await atomic
            .mutate({ type: "sum", key: ["stats", this.prefix, "count"], value: new Deno.KvU64(BigInt(count)) })
            .commit();

        if (!res.ok) throw new Error(`Failed to set chunk of ${chunk.length} timeline entries`);

        // Yield to event loop if processing many chunks
        if (items.length > CHUNK_SIZE) {
            await new Promise(r => setTimeout(r, 0));
        }
    }
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
    this.checkWritePermission();
    const iter = this.kv.list<T>({ prefix: [this.prefix], end: [this.prefix, timestamp] });
    let count = 0;
    let atomic = this.kv.atomic();
    let batchSize = 0;

    for await (const entry of iter) {
      atomic = atomic.delete(entry.key);
      count++;
      batchSize++;

      if (batchSize >= 100) {
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
  
  private isCounting = false;
  async count(): Promise<number> {
    const res = await this.kv.get<Deno.KvU64>(["stats", this.prefix, "count"]);
    if (res.value) {
        return Number(res.value.value);
    }
    
    if (this.isCounting) return 0;
    this.isCounting = true;

    try {
        let count = 0;
        const iter = this.kv.list({ prefix: [this.prefix] });
        for await (const _ of iter) {
          count++;
        }
        await this.kv.set(["stats", this.prefix, "count"], new Deno.KvU64(BigInt(count)));
        return count;
    } finally {
        this.isCounting = false;
    }
  }

  async *getStream(limit?: number, reverse?: boolean): AsyncIterable<T> {
    const iter = this.kv.list<T>({ prefix: [this.prefix] }, { limit, reverse });
    for await (const entry of iter) {
      yield entry.value;
    }
  }
}
