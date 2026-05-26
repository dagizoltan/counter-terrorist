import { assertEquals } from "@std/assert";
import { MeshManager } from "../src/orchestrator/domain/orchestration/mesh.ts";
import { LoggingPort, LogSeverity, LogType, ConfigurationPort, MeshAuthPort } from "../src/orchestrator/core/ports.ts";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { ok } from "../src/orchestrator/core/result.ts";

class MockLogging implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log() {}
    async getRecentLogs() { return []; }
    async logLegacy() {}
    setKv() {}
    async shutdown() {}
}

class MockConfig implements ConfigurationPort {
    getToken() { return "test-token"; }
    getMeshSecret() { return "test-secret-32-chars-long-security-requirement"; }
    getEnv(key: string) {
        if (key === "MESH_SECRET") return "test-secret-32-chars-long-security-requirement";
        return undefined;
    }
    getNumber() { return 8000; }
    getBoolean() { return false; }
}

class MockMeshAuth implements MeshAuthPort {
    async getRootCA() { return ok({ cert: "cert", key: "key" }); }
    async getTrustedCerts() { return ["cert"]; }
    async generateNodeCert() { return ok({ cert: "cert", key: "key" }); }
    async rotateCert() { return ok({ cert: "cert", key: "key" }); }
    stageSecondarySecret() {}
    commitSecretSwap() {}
    validateMeshSecret() { return true; }
}

Deno.test("MeshManager: BFT Consensus logic", async () => {
    // We need a proper AuditService for the MeshManager constructor
    // but we can pass null for most parts if we mock the methods we use
    const mesh = new MeshManager(
        new MockMeshAuth(),
        new MockLogging(),
        { getChainStatus: () => Promise.resolve({ lastHash: "GENESIS", count: 0 }) } as any,
        new MockConfig()
    );

    // Mock registerNode to add nodes manually
    for (let i = 0; i < 3; i++) {
        mesh.registerNode({
            id: `node-${i}`,
            hostname: `node-${i}`,
            address: `10.0.0.${i}`,
            port: 8000,
            lastSeen: Date.now(),
            verified: true
        });
    }

    // N = 4 (3 verified nodes + self). BFT Threshold = 2*4/3 + 1 = 3.

    // Mock sendSync to return approvals/denials
    let callCount = 0;
    (mesh as any).sendSync = async (node: any, payload: any) => {
        callCount++;
        if (node.id === "node-0" || node.id === "node-1") {
            const responsePayload = { approved: true, action: payload.payload.action };
            return {
                approved: true,
                payload: responsePayload,
                signature: "v-sig"
            };
        }
        return { approved: false };
    };

    // Mock verifySignature to always return true for simplicity in this test
    (mesh as any).verifySignature = async () => true;
    (mesh as any).signPayload = async () => "v-sig";

    const result = await mesh.requestQuorumCommand("TEST_ACTION", {});
    assertEquals(result, true, "Should reach consensus with 2 approvals + self = 3/3");
    assertEquals(callCount <= 3, true, "Should stop once threshold is reached");
});
