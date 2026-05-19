import { assertEquals } from "@std/assert";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";
import { MerkleTree } from "../src/orchestrator/core/merkle.ts";

Deno.test("SystemExecutor - extractPathsFromJson recursion limit", async () => {
    const executor = new (SystemExecutor as any)();

    // Create a deeply nested object
    const createNested = (depth: number): any => {
        if (depth === 0) return { path: "/tmp/deep" };
        return { nested: createNested(depth - 1) };
    };

    // Depth 10 should be reachable (limit is 10, depth starts at 0)
    const nested10 = createNested(10);
    const paths10 = (executor as any).extractPathsFromJson(nested10);
    assertEquals(paths10.length, 1, "Should find path at depth 10");
    assertEquals(paths10[0], "/tmp/deep");

    // Depth 12 should be blocked
    const nested12 = createNested(12);
    const paths12 = (executor as any).extractPathsFromJson(nested12);
    assertEquals(paths12.length, 0, "Should NOT find path at depth 12 due to limit");
});

Deno.test("MerkleTree - Verification and Static optimization", async () => {
    const leaves = ["a", "b", "c", "d"];
    const tree = new MerkleTree(leaves);
    const root = await tree.getRoot();

    const proof = await tree.getProof(1); // Proof for "b"
    const isValid = await MerkleTree.verify(root, "b", 1, proof);
    assertEquals(isValid, true, "Proof for 'b' should be valid");

    const isInvalid = await MerkleTree.verify(root, "x", 1, proof);
    assertEquals(isInvalid, false, "Proof for 'x' should be invalid");
});
