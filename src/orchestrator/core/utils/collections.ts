/**
 * BoundedMap
 * A high-performance, memory-safe collection that enforces a maximum capacity.
 * Uses a Linked-List based LRU eviction strategy for O(1) operations.
 */
export class BoundedMap<K, V> {
    private cache: Map<K, ListNode<K, V>> = new Map();
    private head: ListNode<K, V> | null = null;
    private tail: ListNode<K, V> | null = null;

    constructor(private maxCapacity: number = 1000) {}

    set(key: K, value: V) {
        if (this.cache.has(key)) {
            const node = this.cache.get(key)!;
            node.value = value;
            this.moveToHead(node);
            return;
        }

        if (this.cache.size >= this.maxCapacity) {
            this.evict();
        }

        const newNode = new ListNode(key, value);
        this.cache.set(key, newNode);
        this.addToHead(newNode);
    }

    get(key: K): V | undefined {
        const node = this.cache.get(key);
        if (node) {
            this.moveToHead(node);
            return node.value;
        }
        return undefined;
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        const node = this.cache.get(key);
        if (node) {
            this.removeNode(node);
            return this.cache.delete(key);
        }
        return false;
    }

    get size(): number {
        return this.cache.size;
    }

    clear() {
        this.cache.clear();
        this.head = null;
        this.tail = null;
    }

    // --- Private Linked List implementation ---

    private addToHead(node: ListNode<K, V>) {
        node.next = this.head;
        node.prev = null;
        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;
        if (!this.tail) {
            this.tail = node;
        }
    }

    private removeNode(node: ListNode<K, V>) {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    private moveToHead(node: ListNode<K, V>) {
        this.removeNode(node);
        this.addToHead(node);
    }

    private evict() {
        if (this.tail) {
            this.cache.delete(this.tail.key);
            this.removeNode(this.tail);
        }
    }

    // --- Iterators ---

    /**
     * Snapshots the keys to allow safe iteration even if the map is modified
     * during iteration (e.g. elements deleted during a decay cycle).
     */
    *entries(): IterableIterator<[K, V]> {
        const keys = Array.from(this.cache.keys());
        for (const key of keys) {
            const node = this.cache.get(key);
            if (node) yield [key, node.value];
        }
    }

    *values(): IterableIterator<V> {
        const keys = Array.from(this.cache.keys());
        for (const key of keys) {
            const node = this.cache.get(key);
            if (node) yield node.value;
        }
    }

    *keys(): IterableIterator<K> {
        const keys = Array.from(this.cache.keys());
        for (const key of keys) {
            if (this.cache.has(key)) yield key;
        }
    }
}

class ListNode<K, V> {
    public prev: ListNode<K, V> | null = null;
    public next: ListNode<K, V> | null = null;
    constructor(public key: K, public value: V) {}
}
