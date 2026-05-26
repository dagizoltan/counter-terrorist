import { assertEquals, assertRejects } from "@std/assert";
import { MeshManager } from "../src/orchestrator/domain/orchestration/mesh.ts";
import { MeshChaosEngine } from "../src/orchestrator/domain/orchestration/chaos_engine.ts";
import { LoggingPort, LogSeverity, LogType, ConfigurationPort, MeshAuthPort } from "../src/orchestrator/core/ports.ts";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { ok } from "../src/orchestrator/core/result.ts";

// Mock implementation of ports
class MockLogging implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log(): Promise<void> {}
    async getRecentLogs() { return []; }
    async logLegacy(): Promise<void> {}
    setKv(): void {}
    async shutdown(): Promise<void> {}
}

class MockConfig implements ConfigurationPort {
    getToken() { return "test-token"; }
    getMeshSecret() { return "test-secret"; }
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

Deno.test("MeshChaosEngine: Latency simulation", async () => {
    const chaos = new MeshChaosEngine(new MockLogging());
    chaos.start({ latencyMs: { min: 100, max: 200 } });

    const start = Date.now();
    await chaos.applyChaos(async () => {
        return "done";
    });
    const duration = Date.now() - start;

    assertEquals(duration >= 100, true, `Duration should be >= 100ms, got ${duration}ms`);
});

Deno.test("MeshChaosEngine: Packet loss simulation", async () => {
    const chaos = new MeshChaosEngine(new MockLogging());
    chaos.start({ packetLossRate: 1.0 });

    await assertRejects(
        async () => {
            await chaos.applyChaos(async () => {
                return "done";
            });
        },
        Error,
        "CHAOS: Packet dropped"
    );
});

Deno.test("MeshChaosEngine: Partial partition simulation", () => {
    const chaos = new MeshChaosEngine(new MockLogging());
    chaos.start({ partialPartitionRate: 0.5 });

    const results = [];
    for (let i = 0; i < 100; i++) {
        results.push(chaos.shouldPartition(`node-${i}`));
    }

    const partitionedCount = results.filter(r => r).length;
    // With 0.5 rate, we expect around 50 nodes to be partitioned
    assertEquals(partitionedCount > 20 && partitionedCount < 80, true, `Partitioned count was ${partitionedCount}`);
});
