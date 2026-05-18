/**
 * Merkle Tree implementation for high-fidelity integrity verification.
 * Enables O(log n) verification of audit ledger segments.
 */
export class MerkleTree {
    private leaves: string[] = [];
    private tree: string[][] = [];

    constructor(leaves: string[]) {
        this.leaves = leaves;
        this.buildTree();
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
                nextLevel.push(await this.hashPair(left, right));
            }
            currentLevel = nextLevel;
            this.tree.push(currentLevel);
        }
    }

    private async hashPair(a: string, b: string): Promise<string> {
        const data = new TextEncoder().encode(a + b);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    public getRoot(): string {
        return this.tree[this.tree.length - 1][0] || "EMPTY";
    }

    /**
     * Generates a proof of inclusion for a given leaf index.
     */
    public getProof(index: number): string[] {
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
                currentHash = await new MerkleTree([]).hashPair(siblingHash, currentHash);
            } else {
                currentHash = await new MerkleTree([]).hashPair(currentHash, siblingHash);
            }
            currentIndex = Math.floor(currentIndex / 2);
        }

        return currentHash === root;
    }
}
