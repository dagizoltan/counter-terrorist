import { assertEquals, assertExists } from "@std/assert";
import { stub } from "@std/testing/mock";
import { MeshManager, MeshNode } from "@domain/orchestration/mesh.ts";
import { LoggingPort, LogEntry, ConfigurationPort, MeshAuthPort, AuditPort } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";
import * as fc from "npm:fast-check";

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

Deno.test("MeshManager - PBT Node Registration", async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.array(fc.record({
                id: fc.uuid(),
                hostname: fc.string({ minLength: 1 }),
                address: fc.ipV4(),
                port: fc.integer({ min: 1, max: 65535 }),
                lastSeen: fc.integer(),
                verified: fc.boolean()
            }), { maxLength: 20 }),
            async (nodes) => {
                const auth = new MockMeshAuth();
                const logging = new MockLoggingPort();
                const config = new MockConfig();
                const audit = { getRecentEvents: async () => [] };
                const manager = new MeshManager(auth, logging, audit as any, config);
                await manager.init();

                for (const node of nodes) {
                    await manager.registerNode(node);
                }

                // Deduplicate nodes by ID for expected count
                const uniqueIds = new Set(nodes.map(n => n.id));
                assertEquals(manager.getNodes().length, uniqueIds.size);

                await manager.shutdown();
            }
        ),
        { numRuns: 10 }
    );
});
