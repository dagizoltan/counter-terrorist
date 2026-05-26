/**
 * Merkle Tree implementation for high-fidelity integrity verification.
 * Enables O(log n) verification of audit ledger segments.
 */
export class MerkleTree {
    private static encoder = new TextEncoder();
    private leaves: string[] = [];
    private tree: string[][] = [];
    private initPromise: Promise<void>;

    constructor(leaves: string[] = []) {
        this.leaves = leaves;
        this.initPromise = this.buildTree();
    }

    /**
     * SOV-P5: Support incremental leaf addition for O(log N) updates.
     */
    public async addLeaf(leaf: string): Promise<string> {
        await this.initPromise;
        this.leaves.push(leaf);

        if (this.tree.length === 0 || this.tree[0][0] === "EMPTY") {
            this.tree = [[leaf]];
            return leaf;
        }

        this.tree[0] = this.leaves;
        let currentIndex = this.leaves.length - 1;
        let currentHash = leaf;

        for (let i = 0; i < this.tree.length - 1; i++) {
            const level = this.tree[i];
            const isRight = currentIndex % 2 === 1;
            const left = isRight ? level[currentIndex - 1] : currentHash;
            const right = isRight ? currentHash : left; // Simplified logic for incremental build

            currentHash = await MerkleTree.hashPair(left, right);
            currentIndex = Math.floor(currentIndex / 2);

            if (this.tree[i + 1]) {
                this.tree[i + 1][currentIndex] = currentHash;
            } else {
                this.tree.push([currentHash]);
            }
        }

        // Handle case where we need a new root level
        if (this.tree[this.tree.length - 1].length > 1) {
            const lastLevel = this.tree[this.tree.length - 1];
            const left = lastLevel[0];
            const right = lastLevel[1];
            this.tree.push([await MerkleTree.hashPair(left, right)]);
        }

        return await this.getRoot();
    }

    public async waitReady(): Promise<void> {
        await this.initPromise;
    }

    private async buildTree() {
        if (this.leaves.length === 0) {
            this.tree = [["EMPTY"]];
            return;
        }

        let currentLevel = this.leaves;
        this.tree.push(currentLevel);

        while (currentLevel.length > 1) {
            const nextLevel: string[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
                nextLevel.push(await MerkleTree.hashPair(left, right));
            }
            currentLevel = nextLevel;
            this.tree.push(currentLevel);
        }
    }

    public static async hashPair(a: string, b: string): Promise<string> {
        const data = MerkleTree.encoder.encode(a + b);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    public async getRoot(): Promise<string> {
        await this.initPromise;
        return this.tree[this.tree.length - 1][0] || "EMPTY";
    }

    /**
     * Generates a proof of inclusion for a given leaf index.
     */
    public async getProof(index: number): Promise<string[]> {
        await this.initPromise;
        const proof: string[] = [];
        let currentIndex = index;

        for (let i = 0; i < this.tree.length - 1; i++) {
            const level = this.tree[i];
            const isRight = currentIndex % 2 === 1;
            const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

            if (siblingIndex < level.length) {
                proof.push(level[siblingIndex]);
            } else {
                proof.push(level[currentIndex]); // Duplicate if odd number of nodes
            }

            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    /**
     * Verifies a proof of inclusion.
     */
    public static async verify(root: string, leaf: string, index: number, proof: string[]): Promise<boolean> {
        let currentHash = leaf;
        let currentIndex = index;

        for (const siblingHash of proof) {
            const isRight = currentIndex % 2 === 1;
            if (isRight) {
                currentHash = await MerkleTree.hashPair(siblingHash, currentHash);
            } else {
                currentHash = await MerkleTree.hashPair(currentHash, siblingHash);
            }
            currentIndex = Math.floor(currentIndex / 2);
        }

        return currentHash === root;
    }
}
