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

Deno.test("AuditService - projectState reconstruction", async () => {
    const mockRepo: any = {
        getLatest: () => Promise.resolve([
            { id: "evt-1", timestamp: "2026-01-01T00:00:00Z", type: "TEST", message: "Base", data: { val: 1 } }
        ]),
        getDeltas: (id: string) => {
            if (id === "evt-1") {
                return Promise.resolve([
                    { id: "d-1", eventId: "evt-1", timestamp: "2026-01-01T00:00:01Z", field: "val", newValue: 2 },
                    { id: "d-2", eventId: "evt-1", timestamp: "2026-01-01T00:00:02Z", field: "status", newValue: "updated" }
                ]);
            }
            return Promise.resolve([]);
        }
    };

    const { AuditService } = await import("../src/orchestrator/domain/analysis/audit.ts");
    const service = new AuditService(mockRepo, { log: () => Promise.resolve() } as any);

    try {
        const projected = await service.projectState(10);
        assertEquals(projected.length, 1);
        assertEquals((projected[0].data as any).val, 2, "Delta should be applied");
        assertEquals((projected[0].data as any).status, "updated", "New field should be added from delta");
        assertEquals(projected[0].message, "Base", "Base field should remain");
    } finally {
        await service.shutdown();
    }
});

Deno.test("TPMManager - clearSecrets and mapping", async () => {
    const mockLogging: any = { log: () => Promise.resolve() };
    const mockSidecar: any = {
        sendCommand: (sidecar: string, cmd: any) => {
            if (sidecar === "trustroot" && cmd.type === "NvDefine") {
                return Promise.resolve({ success: true });
            }
            return Promise.resolve({ success: false });
        }
    };

    const { TPMManager } = await import("../src/orchestrator/infrastructure/system/protection/tpm/tpm_manager.ts");
    const manager = new TPMManager(mockSidecar, mockLogging);

    // Test clearSecrets triggers sidecar commands
    await manager.clearSecrets();

    // Test dynamic index mapping for unknown secrets
    const index1 = (manager as any).getIndexForSecret("UNKNOWN_1");
    const index2 = (manager as any).getIndexForSecret("UNKNOWN_2");
    assertEquals(index1.startsWith("0x150000"), true);
    assertEquals(index1 !== index2, true, "Different secrets should have different dynamic indices");
});

Deno.test("ComplianceService - Hardware-rooted signing", async () => {
    const mockAudit: any = {
        getChainStatus: () => Promise.resolve({ count: 100 }),
        verifyChain: () => Promise.resolve({ valid: true }),
        getRecentEvents: () => Promise.resolve([])
    };
    const mockTpm: any = {
        sign: (data: string) => Promise.resolve(`HW_SIG_FOR_${data.slice(0, 8)}`)
    };
    const mockKv: any = {
        list: () => ({ [Symbol.asyncIterator]: async function*() {} })
    };
    const mockProcessTracker: any = {
        getTree: () => []
    };

    const { ComplianceService } = await import("../src/orchestrator/domain/analysis/compliance_service.ts");
    const service = new ComplianceService(mockAudit, mockKv, mockProcessTracker, mockTpm);

    const bundle = await service.exportSignedBundle();
    assertEquals(bundle.signature.startsWith("HW_SIG_FOR_"), true);
});
