import { assertEquals } from "@std/assert";
import { CausalGraphService } from "@domain/analysis/causal_graph_service.ts";
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

Deno.test("CausalGraphService - Reconstruct Graph", async () => {
    const logging = new MockLoggingPort();
    const service = new CausalGraphService(logging);

    // Mock forensic data on disk for ForensicSearchTool
    const forensicDir = "./volume/storage/forensics";
    const oldForensicDir = forensicDir + ".bak";
    try { await Deno.rename(forensicDir, oldForensicDir); } catch { /* ignore */ }

    const auditDir = "./volume/storage/audit";
    await Deno.mkdir(forensicDir, { recursive: true });
    await Deno.mkdir(auditDir, { recursive: true });

    const records = [
        { pid: 1001, comm: "bash", syscall: "execve", timestamp: "2023-01-01T10:00:00Z" },
        { pid: 1002, ppid: 1001, comm: "curl", syscall: "execve", timestamp: "2023-01-01T10:00:01Z" },
        { pid: 1002, comm: "curl", syscall: "connect", port: 80, timestamp: "2023-01-01T10:00:02Z" }
    ];

    for (const r of records) {
        await Deno.writeTextFile(`${forensicDir}/${r.pid}-${r.timestamp}.json`, JSON.stringify(r));
    }

    try {
        const res = await service.reconstructGraph(1001);
        assertEquals(res.success, true);
        const nodes = res.data;

        // Should have 3 nodes
        assertEquals(nodes.size, 3);

        // Check relationships
        const bashNode = Array.from(nodes.values()).find(n => n.record.pid === 1001);
        const curlExecNode = Array.from(nodes.values()).find(n => n.record.pid === 1002 && n.record.syscall === "execve");
        const curlConnNode = Array.from(nodes.values()).find(n => n.record.pid === 1002 && n.record.syscall === "connect");

        assertEquals(bashNode?.children.includes(curlExecNode!.id), true);
        assertEquals(curlExecNode?.children.includes(curlConnNode!.id), true);
    } finally {
        // Cleanup mock data
        try {
            await Deno.remove(forensicDir, { recursive: true });
        } catch { /* ignore */ }
        try { await Deno.rename(oldForensicDir, forensicDir); } catch { /* ignore */ }
    }
});
