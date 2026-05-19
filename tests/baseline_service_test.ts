import { assertEquals, assertExists } from "@std/assert";
import { BaselineService, SystemSnapshot } from "@domain/analysis/baseline.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("BaselineService - Snapshot capture and drift detection", async () => {
    const kv = await Deno.openKv(":memory:");
    const logging = new MockLoggingPort();

    // Mock Executor and Sidecar
    const executor = {
        execute: async (cmd: string) => {
            if (cmd === "ss") return { success: true, stdout: "tcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:*", stderr: "" };
            return { success: true, stdout: "", stderr: "" };
        }
    };
    const sidecar = {
        sendCommand: async (name: string, type: any) => {
            if (name === "analyzer" && type === "SCAN") {
                return { success: true, data: { processes: [{ pid: 100, name: "nginx", exe_path: "/usr/sbin/nginx", hash: "hash1" }] } };
            }
            if (name === "analyzer" && typeof type === "object" && type.type === "DIR_SCAN") {
                return { success: true, data: { files: [{ path: "/etc/passwd", hash: "filehash1", mtime: "now" }] } };
            }
            return { success: false };
        }
    };

    const service = new BaselineService(kv, sidecar as any, executor as any, logging);

    // 1. Establish baseline
    await service.setBaseline();
    const baseline = (service as any).currentBaseline as SystemSnapshot;
    assertExists(baseline);
    assertEquals(baseline.ports.includes("0.0.0.0:80"), true);
    assertEquals(baseline.processes[0].name, "nginx");

    // 2. Check drift (no drift)
    const drift1 = await service.checkDrift();
    assertEquals(drift1?.newPorts.length, 0);
    assertEquals(drift1?.newProcs.length, 0);

    // 3. Simulate drift
    // Update executor to return a new port
    (executor as any).execute = async (cmd: string) => {
        if (cmd === "ss") return { success: true, stdout: "tcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:*\ntcp LISTEN 0 128 0.0.0.0:443 0.0.0.0:*", stderr: "" };
        return { success: true, stdout: "", stderr: "" };
    };

    // Update sidecar to return a persistent new process (must persist across 2 scans to avoid noise)
    (sidecar as any).sendCommand = async (name: string, type: any) => {
        if (name === "analyzer" && type === "SCAN") {
            return { success: true, data: { processes: [
                { pid: 100, name: "nginx", exe_path: "/usr/sbin/nginx", hash: "hash1" },
                { pid: 200, name: "malware", exe_path: "/tmp/malware", hash: "hash2" }
            ] } };
        }
        return { success: true, data: { files: [] } };
    };

    // First scan - records previous state
    await service.checkDrift();

    // Second scan - reports drift if persists
    const drift2 = await service.checkDrift();

    assertEquals(drift2?.newPorts.includes("0.0.0.0:443"), true);
    assertEquals(drift2?.newProcs.some(p => p.name === "malware"), true);

    await service.shutdown();
    kv.close();
});

Deno.test("BaselineService - Critical file drift", async () => {
    const kv = await Deno.openKv(":memory:");
    const logging = new MockLoggingPort();

    const executor = { execute: async () => ({ success: true, stdout: "", stderr: "" }) };
    const sidecar = {
        sendCommand: async (name: string, type: any) => {
            if (typeof type === "object" && type.type === "DIR_SCAN") {
                return { success: true, data: { files: [{ path: "/etc/shadow", hash: "hash-original", mtime: "1" }] } };
            }
            return { success: true, data: { processes: [], ports: [] } };
        }
    };

    const service = new BaselineService(kv, sidecar as any, executor as any, logging);
    await service.setBaseline();

    // Simulate change in /etc/shadow
    (sidecar as any).sendCommand = async (name: string, type: any) => {
        if (typeof type === "object" && type.type === "DIR_SCAN") {
            return { success: true, data: { files: [{ path: "/etc/shadow", hash: "hash-modified", mtime: "2" }] } };
        }
        return { success: true, data: { processes: [] } };
    };

    await service.checkDrift();

    assertEquals(logging.logs.some(l => l.message.includes("CRITICAL FILE DRIFT")), true);

    await service.shutdown();
    kv.close();
});
