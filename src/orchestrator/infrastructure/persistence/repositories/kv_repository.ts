/**
 * Generic interface for a repository to decouple logic from storage.
 */
export interface Repository<T> {
  get(id: string): Promise<T | null>;
  set(id: string, data: T): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<T[]>;
}

/**
 * Base implementation using Deno KV.
 * Audit 13.1: Enforces Optimistic Concurrency Control (OCC) for distributed consistency.
 */
export class KvRepository<T> implements Repository<T> {
  protected static isReadOnly = false;

  public static setReadOnly(value: boolean) {
    KvRepository.isReadOnly = value;
  }

  constructor(
    protected kv: Deno.Kv,
    protected prefix: string
  ) {}

  protected checkWritePermission() {
    if (KvRepository.isReadOnly && this.prefix !== "audit" && this.prefix !== "incidents") {
        throw new Error(`Permission Denied: System is in FORENSIC_RESTRICTED mode. Write/Delete blocked for prefix '${this.prefix}'`);
    }
  }

  async get(id: string): Promise<T | null> {
    const res = await this.kv.get<T>([this.prefix, id]);
    return res.value;
  }

  async set(id: string, data: T): Promise<void> {
    this.checkWritePermission();
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        const entry = await this.kv.get<T>([this.prefix, id]);
        const result = await this.kv.atomic()
            .check(entry)
            .set([this.prefix, id], data)
            .commit();

        if (result.ok) return;
        attempts++;
        if (attempts < maxAttempts) {
            // Randomized exponential backoff to reduce contention
            // SOV-M5 FIX: Transition to secure random jitter
            const { secureRandomInt } = await import("../../../core/crypto_utils.ts");
            const jitter = secureRandomInt(0, 50 * Math.pow(2, attempts));
            await new Promise(r => setTimeout(r, jitter));
        }
    }
    throw new Error(`OCC Write Conflict: Failed to set [${this.prefix}, ${id}] after ${maxAttempts} attempts.`);
  }

  async delete(id: string): Promise<void> {
    this.checkWritePermission();
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        const entry = await this.kv.get<T>([this.prefix, id]);
        const result = await this.kv.atomic()
            .check(entry)
            .delete([this.prefix, id])
            .commit();

        if (result.ok) return;
        attempts++;
        if (attempts < maxAttempts) {
            const { secureRandomInt } = await import("../../../core/crypto_utils.ts");
            const jitter = secureRandomInt(0, 50 * Math.pow(2, attempts));
            await new Promise(r => setTimeout(r, jitter));
        }
    }
    throw new Error(`OCC Write Conflict: Failed to delete [${this.prefix}, ${id}] after ${maxAttempts} attempts.`);
  }

  /**
   * Audit 9.2: Implementing True Pagination for large datasets.
   * Returns an async generator to avoid OOM on boot-time hydration.
   */
  async *listPaginated(batchSize = 100): AsyncIterable<T> {
    let cursor: string | undefined = undefined;
    while (true) {
        const iter: Deno.KvListIterator<T> = this.kv.list<T>({ prefix: [this.prefix] }, { limit: batchSize, cursor });
        let count = 0;
        for await (const entry of iter) {
            yield entry.value;
            count++;
        }
        cursor = iter.cursor;
        if (!cursor || count < batchSize) break;
    }
  }

  async list(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this.listPaginated(500)) {
        items.push(item);
    }
    return items;
  }
}
