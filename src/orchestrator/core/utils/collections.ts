/**
 * BoundedMap
 * A memory-safe Map implementation that enforces a maximum capacity
 * and evicts the oldest entries (LRU-ish) when full.
 */
export class BoundedMap<K, V> {
    private map: Map<K, { value: V, timestamp: number }> = new Map();

    constructor(private maxCapacity: number = 1000) {}

    set(key: K, value: V) {
        if (this.map.size >= this.maxCapacity && !this.map.has(key)) {
            // Evict oldest
            let oldestKey: K | null = null;
            let oldestTime = Infinity;

            for (const [k, v] of this.map.entries()) {
                if (v.timestamp < oldestTime) {
                    oldestTime = v.timestamp;
                    oldestKey = k;
                }
            }

            if (oldestKey !== null) {
                this.map.delete(oldestKey);
            }
        }

        this.map.set(key, { value, timestamp: Date.now() });
    }

    get(key: K): V | undefined {
        const entry = this.map.get(key);
        if (entry) {
            // Update timestamp on access (LRU behavior)
            entry.timestamp = Date.now();
            return entry.value;
        }
        return undefined;
    }

    has(key: K): boolean {
        return this.map.has(key);
    }

    delete(key: K) {
        return this.map.delete(key);
    }

    get size(): number {
        return this.map.size;
    }

    entries(): IterableIterator<[K, V]> {
        const innerEntries = this.map.entries();
        return (function* () {
            for (const [k, v] of innerEntries) {
                yield [k, v.value] as [K, V];
            }
        })();
    }

    values(): IterableIterator<V> {
        const innerValues = this.map.values();
        return (function* () {
            for (const v of innerValues) {
                yield v.value;
            }
        })();
    }

    clear() {
        this.map.clear();
    }
}
