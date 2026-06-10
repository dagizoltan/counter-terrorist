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
     * SEC-05: Paginated processing to prevent OOM during event floods.
     */
    async process(handler: (item: T) => Promise<boolean>, maxAttempts = 5, batchSize = 100) {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const iter = this.kv.list<{ item: T, attempts: number, timestamp: number }>(
                { prefix: ["queue", this.name] },
                { limit: batchSize }
            );
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
            // SEC-05: Atomic Failure Transitions
            // Ensure moving to DLQ and removing from active queue is transactional.
            console.error(`PersistentQueue [${this.name}]: Dropping item after ${attempts} failed attempts. Moving to DLQ.`);

            const dlqKey = ["queue", this.name, "dlq", key[key.length - 1]];
            await this.kv.atomic()
                .delete(key)
                .set(dlqKey, { item, attempts, timestamp: Date.now() })
                .commit();
        } else {
            await this.kv.set(key, { item, attempts, timestamp: Date.now() });
        }
    }
}
