import { assertEquals, assertExists } from "@std/assert";
import { ProcessTracker } from "@domain/analysis/process_tracker.ts";
import { ProcessPort, ProcessInfo } from "@domain/ports/process_port.ts";
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

class MockProcessPort implements ProcessPort {
    processes: Map<number, ProcessInfo> = new Map();
    alivePids: Set<number> = new Set();
    ownPid = 1000;

    async getProcessInfo(pid: number): Promise<ProcessInfo | null> {
        return this.processes.get(pid) || null;
    }

    async *listProcesses(): AsyncIterable<number> {
        for (const pid of this.processes.keys()) {
            yield pid;
        }
    }

    isAlive(pid: number): boolean {
        return this.alivePids.has(pid);
    }

    getOwnPid(): number {
        return this.ownPid;
    }
}

Deno.test("ProcessTracker - Tree construction and stray shell detection", async () => {
    const logger = new MockLoggingPort();
    const provider = new MockProcessPort();
    const tracker = new ProcessTracker(logger, provider);

    // 1. Setup a normal process: node (pid 100) -> shell (pid 101)
    provider.processes.set(100, { pid: 100, ppid: 1, comm: "node" });
    provider.processes.set(101, { pid: 101, ppid: 100, comm: "sh" });
    provider.alivePids.add(100);
    provider.alivePids.add(101);

    const analysis = await tracker.analyzeEvent(101, "sh");
    assertEquals(analysis.isStrayShell, true);
    assertEquals(analysis.reason?.includes("suspicious parent: node"), true);

    // 2. Setup a safe process: systemd -> login -> bash
    provider.processes.set(500, { pid: 500, ppid: 1, comm: "login" });
    provider.processes.set(501, { pid: 501, ppid: 500, comm: "bash" });
    provider.alivePids.add(500);
    provider.alivePids.add(501);

    const analysis2 = await tracker.analyzeEvent(501, "bash");
    assertEquals(analysis2.isStrayShell, false);

    tracker.shutdown();
});

Deno.test("ProcessTracker - Ghost process identification", async () => {
    const logger = new MockLoggingPort();
    const provider = new MockProcessPort();
    const tracker = new ProcessTracker(logger, provider);

    // 1. Add processes to tracker
    tracker.updateProcess(200, 1, "legit-process");
    tracker.updateProcess(300, 1, "hidden-process");

    // 2. Mock provider: legit-process is visible, hidden-process is NOT in list but IS alive
    provider.processes.set(200, { pid: 200, ppid: 1, comm: "legit-process" });
    provider.alivePids.add(200);
    provider.alivePids.add(300); // Hiding!

    const ghosts = await tracker.scanForGhosts();
    assertEquals(ghosts.includes(300), true);
    assertEquals(logger.logs.some(l => l.message.includes("GHOST PROCESSES DETECTED")), true);

    tracker.shutdown();
});

Deno.test("ProcessTracker - Cleanup", async () => {
    const logger = new MockLoggingPort();
    const provider = new MockProcessPort();
    const tracker = new ProcessTracker(logger, provider);

    tracker.updateProcess(400, 1, "dead-process");
    assertEquals(tracker.getTree().length, 1);

    // Process 400 is not alive in provider
    await tracker.cleanup();
    assertEquals(tracker.getTree().length, 0);

    tracker.shutdown();
});
