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
    await this.kv.set([this.prefix, id], data);
  }

  async delete(id: string): Promise<void> {
    this.checkWritePermission();
    await this.kv.delete([this.prefix, id]);
  }

  async list(): Promise<T[]> {
    const iter = this.kv.list<T>({ prefix: [this.prefix] });
    const items: T[] = [];
    for await (const entry of iter) {
      items.push(entry.value);
    }
    return items;
  }
}
