/**
 * Bloom Filter Implementation for high-performance set membership checks.
 * Used for hot-path caching (e.g. IP whitelisting, hash verification).
 */
export class BloomFilter {
    private bits: Uint8Array;
    private size: number;
    private hashCount: number;

    constructor(size: number = 1024 * 8, hashCount: number = 3) {
        this.size = size;
        this.bits = new Uint8Array(Math.ceil(size / 8));
        this.hashCount = hashCount;
    }

    private getHashes(val: string): number[] {
        let h1 = 0;
        let h2 = 0;
        for (let i = 0; i < val.length; i++) {
            h1 = (h1 * 31 + val.charCodeAt(i)) >>> 0;
            h2 = (h2 * 37 + val.charCodeAt(i)) >>> 0;
        }

        const hashes = [];
        for (let i = 0; i < this.hashCount; i++) {
            hashes.push((h1 + i * h2) % this.size);
        }
        return hashes;
    }

    add(val: string) {
        const hashes = this.getHashes(val);
        for (const h of hashes) {
            const byteIdx = Math.floor(h / 8);
            const bitIdx = h % 8;
            this.bits[byteIdx] |= (1 << bitIdx);
        }
    }

    has(val: string): boolean {
        const hashes = this.getHashes(val);
        for (const h of hashes) {
            const byteIdx = Math.floor(h / 8);
            const bitIdx = h % 8;
            if (!(this.bits[byteIdx] & (1 << bitIdx))) return false;
        }
        return true;
    }

    clear() {
        this.bits.fill(0);
    }
}
