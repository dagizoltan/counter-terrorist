/**
 * Shared Key-Value storage infrastructure.
 */

export class KvStore {
  private kv: Deno.Kv | null = null;

  async init(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  get instance(): Deno.Kv {
    if (!this.kv) {
      throw new Error("KV Store not initialized. Call init() first.");
    }
    return this.kv;
  }

  async close() {
    if (this.kv) {
      await this.kv.close();
      this.kv = null;
    }
  }
}
