import { assertEquals } from "@std/assert";
import { CausalGraphService } from "@domain/analysis/causal_graph_service.ts";
import { LoggingPort } from "@core/ports.ts";

const mockLogging: any = {
    log: async () => {},
    logLegacy: async () => {},
    getRecentLogs: async () => [],
    setKv: () => {},
    enableGlobalIntercept: () => {},
    shutdown: async () => {}
};

Deno.test("CausalGraphService - Enhanced Heuristics", async () => {
    const service = new CausalGraphService(mockLogging);

    // Mock records to test new heuristics
    const records = [
        { pid: 100, comm: "systemd", syscall: "execve", timestamp: "2026-06-12T10:00:00Z" },
        { pid: 200, ppid: 100, comm: "nginx", syscall: "execve", timestamp: "2026-06-12T10:00:01Z" },
        { pid: 200, comm: "nginx", syscall: "connect", timestamp: "2026-06-12T10:00:02Z", port: 80, type: "NETWORK_EVENT" },
        { pid: 200, comm: "nginx", syscall: "openat", timestamp: "2026-06-12T10:00:03Z", path: "/tmp/exploit", type: "FILE_EVENT" }
    ];

    // Access private searchTool via cast to any for testing
    (service as any).searchTool = {
        search: async () => ({ success: true, data: records })
    };

    const res = await service.reconstructGraph(100);
    if (!res.success) throw res.error;

    const nodes = Array.from(res.data.values());
    assertEquals(nodes.length, 4);

    const nginxProcess = nodes.find(n => n.record.pid === 200 && n.record.syscall === "execve");
    const nginxNetwork = nodes.find(n => n.type === "NETWORK");
    const nginxFile = nodes.find(n => n.type === "FILE");

    // Verify relations
    assertEquals(nginxProcess?.children.includes(nginxNetwork!.id), true, "Process should be linked to its network activity");
    assertEquals(nginxProcess?.children.includes(nginxFile!.id), true, "Process should be linked to its file activity");
});
