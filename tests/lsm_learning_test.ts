import { assertEquals } from "@std/assert";
import { LsmLearningService } from "@domain/protection/lsm_learning_service.ts";
import { CommandPort, LoggingPort, CommandResult, LogEntry } from "@core/ports.ts";

class MockCommandPort implements CommandPort {
  commands: any[] = [];
  eventHandlers: Map<string, ((event: any) => void)> = new Map();

  async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
    this.commands.push({ sidecar, command });
    return { success: true, stdout: "", stderr: "" };
  }

  onEvent(sidecar: string, handler: (event: any) => void): void {
    this.eventHandlers.set(sidecar, handler);
  }

  emitEvent(sidecar: string, event: any): void {
    const handler = this.eventHandlers.get(sidecar);
    if (handler) handler(event);
  }

  async getPersistentSidecar(_sidecar: string): Promise<any> { return null; }
  isRunning(_sidecar: string): boolean { return true; }
  async restartSidecar(_sidecar: string): Promise<void> {}
  async stopSidecar(_sidecar: string): Promise<void> {}
  getPID(_sidecar: string): number | null { return 1234; }
  getTpm(): any { return null; }
  getExecutor(): any { return null; }
}

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("LsmLearningService - Learning Lifecycle", async () => {
    const sidecarManager = new MockCommandPort();
    const logging = new MockLoggingPort();
    const service = new LsmLearningService(sidecarManager, logging);
    await service.init();

    // 1. Start learning
    await service.startLearning();
    assertEquals(sidecarManager.commands[0].command.type, "SET_LEARNING_MODE");
    assertEquals(sidecarManager.commands[0].command.learning_mode, true);

    // 2. Feed events
    // @ts-ignore: Access private for testing
    service.handleAccessEvent({
        type: "FS_ACCESS_EVENT",
        pid: 1234,
        comm: "analyzer",
        syscall: "openat",
        path: "/etc/passwd",
        timestamp: new Date().toISOString()
    });

    // 3. Verify allowlist
    const allowlist = service.generateAllowlist("analyzer");
    assertEquals(allowlist.length, 1);
    assertEquals(allowlist[0], "openat:/etc/passwd");

    // 4. Stop learning
    await service.stopLearning();
    assertEquals(sidecarManager.commands[1].command.learning_mode, false);
});

Deno.test("LsmLearningService - Profile Generation", async () => {
    const sidecarManager = new MockCommandPort();
    const logging = new MockLoggingPort();
    const service = new LsmLearningService(sidecarManager, logging);
    await service.init();
    await service.startLearning();

    // @ts-ignore
    service.handleAccessEvent({ type: "FS_ACCESS_EVENT", comm: "test", syscall: "read", path: "/data", timestamp: "..." });
    // @ts-ignore
    service.handleAccessEvent({ type: "FS_ACCESS_EVENT", comm: "test", syscall: "write", path: "/data", timestamp: "..." });

    const profile = service.generateProfile("test");
    assertEquals(profile.includes('path "/data" { allow [read, write] }'), true);
});
