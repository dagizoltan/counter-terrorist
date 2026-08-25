import { assertEquals, assertExists } from "@std/assert";
import { stub } from "@std/testing/mock";
import { CanaryService } from "@domain/protection/canary_service.ts";
import { LoggingPort, LogEntry, CommandPort, CommandResult } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

class MockCommandPort implements CommandPort {
    commands: any[] = [];
    async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
        this.commands.push({ sidecar, command });
        return { success: true, stdout: "", stderr: "" };
    }
    onEvent(): void {}
    emitEvent(): void {}
    async getPersistentSidecar(): Promise<any> { return {}; }
    isRunning(): boolean { return true; }
    async restartSidecar(): Promise<void> {}
    async stopSidecar(): Promise<void> {}
    getPID(): number { return 1; }
    getTpm(): any { return null; }
    getExecutor(): any { return null; }
}

Deno.test("CanaryService - Token registration and access", async () => {
    const logger = new MockLoggingPort();
    const sidecar = new MockCommandPort();
    const audit = { logEvent: async (e: any) => { logger.logs.push({ message: e.message } as any); } };

    const service = new CanaryService(audit as any, sidecar, logger);

    // Mock production environment for link logic
    const envStub = stub(Deno.env, "get", (key: string) => key === "ENVIRONMENT" ? "production" : undefined);

    // Stub filesystem operations to avoid real IO
    const mkdirStub = stub(Deno, "mkdir", () => Promise.resolve());
    const writeTextStub = stub(Deno, "writeTextFile", () => Promise.resolve());
    const linkStub = stub(Deno, "link", () => Promise.resolve());
    const statStub = stub(Deno, "stat", () => Promise.reject(new Deno.errors.NotFound()));

    try {
        await service.registerToken({ id: "test_token", path: "/tmp/fake_secrets.txt", desc: "Test token" });

        const tokens = service.getTokens();
        const testToken = tokens.find(t => t.id === "test_token");
        assertExists(testToken);

        // Simulate access
        const triggered = await service.handleFileAccess("/tmp/fake_secrets.txt", "attacker_process");
        assertEquals(triggered, true);
        assertEquals(testToken.triggered, true);
        assertEquals(logger.logs.some(l => l.message.includes("CANARY TRIGGERED")), true);

    } finally {
        envStub.restore();
        mkdirStub.restore();
        writeTextStub.restore();
        linkStub.restore();
        statStub.restore();
        await service.shutdown();
    }
});
