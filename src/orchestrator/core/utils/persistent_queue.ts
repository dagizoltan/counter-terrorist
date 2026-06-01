/**
 * PersistentQueue
 * A durable, KV-backed queue for reliable delivery of security alerts and logs.
 */
export class PersistentQueue<T> {
    private isProcessing = false;

    constructor(
        private kv: Deno.Kv,
        private name: string
    ) {}

    /**
     * Enqueues an item for later processing.
     */
    async enqueue(item: T) {
        const id = crypto.randomUUID();
        await this.kv.set(["queue", this.name, id], {
            item,
            attempts: 0,
            timestamp: Date.now()
        });
    }

    /**
     * Processes items in the queue using the provided handler.
     */
    async process(handler: (item: T) => Promise<boolean>, maxAttempts = 5) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const iter = this.kv.list<{ item: T, attempts: number, timestamp: number }>({ prefix: ["queue", this.name] });
            for await (const entry of iter) {
                const { item, attempts } = entry.value;

                try {
                    const success = await handler(item);
                    if (success) {
                        await this.kv.delete(entry.key);
                    } else {
                        await this.handleFailure(entry.key, item, attempts + 1, maxAttempts);
                    }
                } catch (e) {
                    await this.handleFailure(entry.key, item, attempts + 1, maxAttempts);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async handleFailure(key: Deno.KvKey, item: T, attempts: number, maxAttempts: number) {
        if (attempts >= maxAttempts) {
            // Move to dead-letter queue or just drop after logging
            console.error(`PersistentQueue [${this.name}]: Dropping item after ${attempts} failed attempts.`);
            await this.kv.delete(key);
            await this.kv.set(["queue", this.name, "dlq", key[2]], { item, attempts, timestamp: Date.now() });
        } else {
            await this.kv.set(key, { item, attempts, timestamp: Date.now() });
        }
    }
}
