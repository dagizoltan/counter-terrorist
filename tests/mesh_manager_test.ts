import { assertEquals, assertExists } from "@std/assert";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { MeshManager, MeshNode } from "@domain/orchestration/mesh.ts";
import { LoggingPort, LogEntry, ConfigurationPort, MeshAuthPort, AuditPort } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

class MockMeshAuth implements MeshAuthPort {
    async getRootCA(): Promise<any> { return {}; }
    async getTrustedCerts(): Promise<string[]> { return ["cert1"]; }
    async generateNodeCert(id: string): Promise<Result<any>> {
        return ok({ cert: "cert-" + id, key: "key-" + id });
    }
    async rotateCert(id: string): Promise<any> { return {}; }
}

class MockConfig implements ConfigurationPort {
    kv = null;
    getToken(): string | undefined { return "token"; }
    getMeshSecret(): string | undefined { return "secret"; }
    getEnv(key: string): string | undefined { return key === "SINGLE_NODE" ? "false" : undefined; }
    getNumber(key: string, def: number): number { return def; }
    getBoolean(key: string, def: boolean): boolean { return def; }
}

Deno.test("MeshManager - Node registration and isolation", async () => {
    const auth = new MockMeshAuth();
    const logging = new MockLoggingPort();
    const config = new MockConfig();
    const audit = { getRecentEvents: async () => [] };
    const manager = new MeshManager(auth, logging, audit as any, config);
    await manager.init();

    const node: MeshNode = {
        id: "node-2",
        hostname: "peer-2",
        address: "10.0.0.2",
        port: 8000,
        lastSeen: Date.now() - 1000,
        verified: true
    };

    await manager.registerNode(node);
    assertEquals(manager.getNodes().length, 1);
    assertEquals(manager.getActiveNodeCount(), 1);

    await manager.isolateNode("node-2");
    assertEquals(manager.getNodes().length, 0);

    await manager.shutdown();
});

Deno.test("MeshManager - Consensus logic", async () => {
    const auth = new MockMeshAuth();
    const logging = new MockLoggingPort();
    const config = new MockConfig();
    const audit = { getRecentEvents: async () => [] };
    const manager = new MeshManager(auth, logging, audit as any, config);
    await manager.init();

    // Register 2 verified nodes
    await manager.registerNode({ id: "n1", hostname: "h1", address: "10.0.0.1", port: 8000, lastSeen: Date.now() - 1000, verified: true });
    await manager.registerNode({ id: "n2", hostname: "h2", address: "10.0.0.2", port: 8000, lastSeen: Date.now() - 1000, verified: true });

    // Mock sendSync for approval
    const sendSyncStub = stub(manager as any, "sendSync", (node: any) => {
        if (node.id === "n1") {
            return Promise.resolve({
                approved: true,
                payload: { action: "TEST_ACTION" },
                signature: "v-sig"
            });
        }
        if (node.id === "n2") return Promise.resolve({ approved: false });
        return Promise.resolve({ approved: false });
    });

    // Mock signature logic
    stub(manager as any, "signPayload", () => Promise.resolve("sig"));
    stub(manager as any, "verifySignature", () => Promise.resolve(true));

    try {
        // Threshold for 3 nodes (self + 2) is floor(3/2) + 1 = 2
        // We have self (1) + n1 (1) = 2. Approved.
        const approved = await manager.requestQuorumCommand("TEST_ACTION", {});
        assertEquals(approved, true);

        // Change stub to deny both
        sendSyncStub.restore();
        const sendSyncStub2 = stub(manager as any, "sendSync", () => Promise.resolve({ approved: false }));
        try {
            const approved2 = await manager.requestQuorumCommand("FAIL_ACTION", {});
            assertEquals(approved2, false);
        } finally {
            sendSyncStub2.restore();
        }
    } finally {
        await manager.shutdown();
    }
});

Deno.test("MeshManager - Identity Rotation Rollback", async () => {
    const auth = new MockMeshAuth();
    const logging = new MockLoggingPort();
    const config = new MockConfig();
    const audit = { getRecentEvents: async () => [] };
    const manager = new MeshManager(auth, logging, audit as any, config);
    await manager.init();

    const originalId = manager.getNodeId();

    // Mock init failure during rotation
    const initStub = stub(manager, "init", () => Promise.resolve({ success: false, error: new Error("Simulated failure") } as any));

    try {
        const result = await manager.rotateIdentity();
        assertEquals(result.success, false);
        assertEquals(manager.getNodeId(), originalId); // Should have rolled back
        assertEquals(logging.logs.some(l => l.message.includes("Rolled back")), true);
    } finally {
        initStub.restore();
        await manager.shutdown();
    }
});
