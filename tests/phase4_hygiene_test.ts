import { assertEquals } from "@std/assert";
import { CausalGraphService } from "@domain/analysis/causal_graph_service.ts";
import { LoggingPort } from "@core/ports.ts";
import { ForensicRecord } from "../src/orchestrator/tools/ops/forensic_query.ts";

const mockLogging: LoggingPort = {
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
    const records: ForensicRecord[] = [
        { pid: 100, comm: "systemd", syscall: "execve", timestamp: "2026-06-12T10:00:00Z" },
        { pid: 200, ppid: 100, comm: "nginx", syscall: "execve", timestamp: "2026-06-12T10:00:01Z" },
        { pid: 200, comm: "nginx", syscall: "connect", timestamp: "2026-06-12T10:00:02Z", port: 80, type: "NETWORK_EVENT" },
        { pid: 200, comm: "nginx", syscall: "openat", timestamp: "2026-06-12T10:00:03Z", path: "/tmp/exploit", type: "FILE_EVENT" }
    ];

    // Access private searchTool via cast to any for testing or use a better pattern
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

Deno.test("SystemExecutor - DANGEROUS_PATTERN Evolution", async () => {
    const { SystemExecutor } = await import("@infrastructure/system/system_executor.ts");
    const executor = new SystemExecutor();

    // Should allow paths but block metacharacters
    const res1 = (executor as any).validateSensitiveArgument("/var/lib/cts/allowed", "ls");
    assertEquals(res1.valid, true, "Valid path should be allowed");

    const res2 = (executor as any).validateSensitiveArgument("/tmp/test; rm -rf /", "ls");
    assertEquals(res2.valid, false, "Metacharacter in path should be blocked");

    const res3 = (executor as any).validateSensitiveArgument("user@[2001:db8::1]:/remote/path", "scp");
    assertEquals(res3.valid, true, "IPv6 remote path should be allowed");

    const res4 = (executor as any).validateSensitiveArgument("user@host:;whoami", "scp");
    assertEquals(res4.valid, false, "Command chain in remote path should be blocked");
});

Deno.test("BehavioralAnalyzer - Bayesian Anomaly Scoring and Intent Verdict", async () => {
    const { BehavioralAnalyzer } = await import("@domain/analysis/behavioral_analyzer.ts");
    const analyzer = new BehavioralAnalyzer();

    // 1. Establish baseline in learning mode
    analyzer.setLearningMode(true);
    for (let i = 0; i < 100; i++) {
        analyzer.trackSyscall(1001, "deno", "read");
        analyzer.trackSyscall(1001, "deno", "write");
    }
    analyzer.setLearningMode(false);

    // 2. Test Anomaly Scoring
    const normalScore = analyzer.getSyscallAnomalyScore("deno", "read");
    const rareScore = analyzer.getSyscallAnomalyScore("deno", "ptrace");

    assertEquals(normalScore < 0.2, true, "Common syscall should have low anomaly score");
    assertEquals(rareScore > 0.8, true, "Rare syscall should have high anomaly score");

    // 3. Test Intent Verdict (Sequence matching)
    analyzer.trackSyscall(2002, "malware", "mmap");
    analyzer.trackSyscall(2002, "malware", "mprotect");
    analyzer.trackSyscall(2002, "malware", "ptrace");

    const verdict = analyzer.getIntentVerdict(2002);
    assertEquals(verdict?.intent, "SHELLCODE_INJECT", "Malicious sequence should trigger SHELLCODE_INJECT intent");
});
