import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MeshManager } from "../src/orchestrator/domain/orchestration/mesh.ts";

Deno.test("Mesh Discovery Resilience - Subnet discovery re-entrancy protection", async () => {
    // Mock minimal dependencies
    const mockAuth = {
        getTrustedCerts: () => Promise.resolve([]),
        generateProxyNodeCert: () => Promise.resolve({ success: true, data: { cert: "mock" } })
    };
    const mockLogging = { log: () => Promise.resolve() };
    const mockAudit = { getChainStatus: () => Promise.resolve({ lastHash: "00" }) };
    const mockConfig = {
        getEnv: (k: string) => k === "SINGLE_NODE" ? "false" : undefined,
        getNumber: () => 8000,
        getBoolean: () => true
    };

    const mesh = new MeshManager(mockAuth as any, mockLogging as any, mockAudit as any, mockConfig as any);

    // @ts-ignore: Mocking httpClient to avoid real networking
    mesh.httpClient = {};

    let startCount = 0;
    const originalInterfaces = Deno.networkInterfaces;

    // Mock network interfaces to simulate a pause
    Deno.networkInterfaces = () => {
        startCount++;
        return [{ family: "IPv4", address: "192.168.1.50", netmask: "255.255.255.0" }] as any;
    };

    try {
        // Trigger multiple simultaneous discoveries
        const p1 = (mesh as any).discoverSubnet();
        const p2 = (mesh as any).discoverSubnet();
        const p3 = (mesh as any).discoverSubnet();

        await Promise.all([p1, p2, p3]);

        assert(startCount === 1, "discoverSubnet should have only executed once due to re-entrancy guard");
        assert(!(mesh as any).isDiscovering, "isDiscovering flag should be reset after completion");

    } finally {
        Deno.networkInterfaces = originalInterfaces;
    }
});
