import { assertEquals } from "@std/assert";
import { AutoBlockService } from "@domain/protection/auto_block_service.ts";
import { EventBus } from "@domain/analysis/events.ts";
import { LoggingPort, LogEntry, FirewallPort, CommandResult } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

class MockFirewallPort implements FirewallPort {
    blockedIps: string[] = [];
    isolatedPids: number[] = [];

    async blockIp(ip: string): Promise<CommandResult> {
        this.blockedIps.push(ip);
        return { success: true, stdout: "", stderr: "" };
    }
    async enforcePid(pid: number): Promise<CommandResult> {
        this.isolatedPids.push(pid);
        return { success: true, stdout: "", stderr: "" };
    }
    async quarantineProcess(pid: number): Promise<CommandResult> {
        this.isolatedPids.push(pid);
        return { success: true, stdout: "", stderr: "" };
    }

    async unblockIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async isBlocked(_ip: string): Promise<boolean> { return false; }
    async shadowBanIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async lockdown(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async killProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async unenforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getStatus(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async flushRules(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getBlockedIps(): Promise<string[]> { return this.blockedIps; }
    async allowPort(_port: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async denyPort(_port: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async setKv(_kv: any): Promise<void> {}
}

Deno.test("AutoBlockService - Respond to HONEYPOT event", async () => {
    const logger = new MockLoggingPort();
    const firewall = new MockFirewallPort();
    const eventBus = new EventBus(logger);
    const service = new AutoBlockService(firewall, logger);
    service.setEventBus(eventBus);
    await service.init();

    // Trigger honeypot event
    eventBus.emit("HONEYPOT", { source_ip: "10.0.0.1", type: "port_scan", port: 22 });

    // Wait for async handler
    await new Promise(r => setTimeout(r, 200));

    assertEquals(firewall.blockedIps.includes("10.0.0.1"), true);
    assertEquals(logger.logs.some(l => l.message.includes("Automated block triggered for 10.0.0.1")), true);

    await service.shutdown();
});

Deno.test("AutoBlockService - Respond to EBPF_CRITICAL anomaly", async () => {
    const logger = new MockLoggingPort();
    const firewall = new MockFirewallPort();
    const eventBus = new EventBus(logger);
    const service = new AutoBlockService(firewall, logger);
    service.setEventBus(eventBus);
    await service.init();

    // Trigger critical eBPF event with high anomaly score
    eventBus.emit("EBPF_CRITICAL", { pid: 1234, comm: "malware", anomalyScore: 0.9, ip: "10.0.0.2", syscall: "execve" } as any);

    await new Promise(r => setTimeout(r, 200));

    assertEquals(firewall.blockedIps.includes("10.0.0.2"), true);
    assertEquals(firewall.isolatedPids.includes(1234), true);

    await service.shutdown();
});
