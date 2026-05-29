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

Deno.test("CausalGraphService - Circular Lineage and Temporal Ordering", async () => {
    const logging = new MockLoggingPort();
    const service = new CausalGraphService(logging);

    const forensicDir = "./volume/storage/forensics";
    const oldForensicDir = forensicDir + ".bak";
    try { await Deno.rename(forensicDir, oldForensicDir); } catch { /* ignore */ }
    await Deno.mkdir(forensicDir, { recursive: true });

    const records = [
        // A spawns B
        { pid: 2001, comm: "parent", syscall: "execve", timestamp: "2023-01-01T10:00:00Z" },
        { pid: 2002, ppid: 2001, comm: "child", syscall: "execve", timestamp: "2023-01-01T10:00:01Z" },
        // B spawns C
        { pid: 2003, ppid: 2002, comm: "grandchild", syscall: "execve", timestamp: "2023-01-01T10:00:02Z" },
        // C tries to claim it's parent of A (Impossible/Circular)
        { pid: 2001, ppid: 2003, comm: "parent", syscall: "execve", timestamp: "2023-01-01T10:00:03Z" }
    ];

    for (const r of records) {
        await Deno.writeTextFile(`${forensicDir}/${r.pid}-${r.timestamp}.json`, JSON.stringify(r));
    }

    try {
        const res = await service.reconstructGraph(2001);
        assertEquals(res.success, true);
        const nodes = res.data;

        // Check that temporal ordering prevents the circular link (Rule 1: Temporal precedence)
        // Record 3 is related to Record 0 (same PID), but Record 0 happened earlier.
        // Rule 1 says: if (new Date(child.timestamp) < new Date(parent.timestamp)) return false;

        const parentNode = Array.from(nodes.values()).find(n => n.record.pid === 2001 && n.record.timestamp === records[0].timestamp);
        const childNode = Array.from(nodes.values()).find(n => n.record.pid === 2002);
        const grandchildNode = Array.from(nodes.values()).find(n => n.record.pid === 2003);
        const parentResNode = Array.from(nodes.values()).find(n => n.record.pid === 2001 && n.record.timestamp === records[3].timestamp);

        assertEquals(parentNode?.children.includes(childNode!.id), true);
        assertEquals(childNode?.children.includes(grandchildNode!.id), true);
        assertEquals(grandchildNode?.children.includes(parentResNode!.id), true);

        // Circular check: parentResNode should NOT be parent of parentNode
        assertEquals(parentResNode?.children.includes(parentNode!.id), false);
    } finally {
        try { await Deno.remove(forensicDir, { recursive: true }); } catch { /* ignore */ }
        try { await Deno.rename(oldForensicDir, forensicDir); } catch { /* ignore */ }
    }
});
