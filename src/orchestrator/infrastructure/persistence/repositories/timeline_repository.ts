import { KvRepository } from "./kv_repository.ts";

/**
 * A repository that stores items with a timestamp in the key for chronological access.
 * Key format: [prefix, timestamp, id]
 */
export class TimelineRepository<T extends { id: string; timestamp: string | number }> extends KvRepository<T> {
  async set(id: string, data: T): Promise<void> {
    const ts = typeof data.timestamp === "string" ? new Date(data.timestamp).getTime() : data.timestamp;
    await this.kv.set([this.prefix, ts, id], data);
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
    for await (const entry of iter) {
      await this.kv.delete(entry.key);
      count++;
    }
    return count;
  }
  
  async count(): Promise<number> {
    let count = 0;
    const iter = this.kv.list({ prefix: [this.prefix] });
    for await (const _ of iter) {
      count++;
    }
    return count;
  }
}
