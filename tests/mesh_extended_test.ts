import { assertEquals } from "@std/assert";
import { MeshManager } from "@domain/orchestration/mesh.ts";

Deno.test("MeshManager - Consensus under heavy load", async () => {
    const auth = { getTrustedCerts: async () => ["c1"] } as any;
    const logging = { log: () => Promise.resolve() } as any;
    const config = { getEnv: () => "false", getNumber: (k: string, d: number) => d, getBoolean: (k: string, d: boolean) => d } as any;
    const audit = { getRecentEvents: async () => [] };

    const manager = new MeshManager(auth, logging, audit as any, config);

    // Register 10 nodes
    for (let i = 0; i < 10; i++) {
        await manager.registerNode({
            id: `n${i}`, hostname: `h${i}`, address: `10.0.0.${i}`, port: 8000,
            lastSeen: Date.now(), verified: true
        });
    }

    assertEquals(manager.getActiveNodeCount(), 10);
    await manager.shutdown();
});

Deno.test("MeshManager - Isolation of malicious peers", async () => {
    const auth = { getTrustedCerts: async () => ["c1"] } as any;
    const logging = { log: () => Promise.resolve() } as any;
    const config = { getEnv: () => "false", getNumber: (k: string, d: number) => d, getBoolean: (k: string, d: boolean) => d } as any;
    const audit = { getRecentEvents: async () => [] };

    const manager = new MeshManager(auth, logging, audit as any, config);

    await manager.registerNode({ id: "evil", hostname: "malicious", address: "6.6.6.6", port: 8000, lastSeen: Date.now(), verified: true });
    assertEquals(manager.getActiveNodeCount(), 1);

    await manager.isolateNode("evil");
    assertEquals(manager.getActiveNodeCount(), 0);

    await manager.shutdown();
});
