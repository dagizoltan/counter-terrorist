import { assertEquals, assertExists } from "@std/assert";
import { stub } from "@std/testing/mock";
import { KernelService } from "@domain/protection/kernel_service.ts";
import { ExecutorPort, CommandPort, LoggingPort, LogEntry, CommandResult } from "@core/ports.ts";
import { AuditService } from "@domain/analysis/audit.ts";

class MockExecutor implements ExecutorPort {
    calls: any[] = [];
    async execute(cmd: string, args: string[]): Promise<CommandResult> {
        this.calls.push({ cmd, args });
        return { success: true, stdout: "1", stderr: "" }; // Default success
    }
    async executeAsync(_cmd: string, _args: string[]): Promise<void> {}
}

class MockCommandPort implements CommandPort {
    commands: any[] = [];
    async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
        this.commands.push({ sidecar, command });
        return { success: true, stdout: "", stderr: "" };
    }
    onEvent(): void {}
    emitEvent(): void {}
    async getPersistentSidecar(): Promise<any> { return { pid: 1 }; }
    isRunning(): boolean { return true; }
    async restartSidecar(): Promise<void> {}
    async stopSidecar(): Promise<void> {}
    getPID(): number { return 1; }
    getTpm(): any { return null; }
    getExecutor(): any { return new MockExecutor(); }
}

Deno.test("KernelService - sysctl hardening application", async () => {
    const executor = new MockExecutor();
    const sidecar = new MockCommandPort();
    const audit = { logEvent: async () => {}, getLogging: () => ({ log: async () => {} }) };
    const config = { getBoolean: () => true };
    const service = new KernelService(executor as any, audit as any, config as any, sidecar as any);

    await service.start();

    // Verify critical sysctl calls
    assertEquals(executor.calls.some(c => c.args.includes("net.ipv4.tcp_syncookies=1")), true);
    assertEquals(executor.calls.some(c => c.args.includes("kernel.randomize_va_space=2")), true);
});

Deno.test("KernelService - Process camouflage", async () => {
    const executor = new MockExecutor();
    const audit = { logEvent: async () => {}, getLogging: () => ({ log: async () => {} }) };
    const config = { getBoolean: () => true };
    const service = new KernelService(executor as any, audit as any, config as any);

    // Mock Deno.stat to simulate helper script existence
    const statStub = stub(Deno, "stat", () => Promise.resolve({ isFile: true } as any));

    try {
        await service.camouflage();

        // Verify call to update_comm.sh
        assertEquals(executor.calls.some(c => c.cmd.includes("update_comm.sh") && c.args.includes("[kworker/u64:1]")), true);
    } finally {
        statStub.restore();
    }
});

Deno.test("KernelService - eBPF Syscall Block", async () => {
    const executor = new MockExecutor();
    const sidecar = new MockCommandPort();
    const audit = { logEvent: async () => {}, getLogging: () => ({ log: async () => {} }) };
    const config = { getBoolean: () => true };
    const service = new KernelService(executor as any, audit as any, config as any, sidecar as any);

    await service.blockSyscall(1234, "execve");

    // Verify sidecar command
    assertEquals(sidecar.commands.some(c => c.sidecar === "sentinel" && c.command.type === "BLOCK_SYSCALL" && c.command.pid === 1234), true);
});
