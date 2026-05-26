import { assertEquals } from "@std/assert";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { PlaybookService } from "@domain/orchestration/playbook_service.ts";
import { EventBus } from "@domain/analysis/events.ts";
import { LoggingPort, LogEntry, FirewallPort, CommandResult, PcapPort } from "@core/ports.ts";

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
    killedPids: number[] = [];
    async blockIp(ip: string): Promise<CommandResult> { this.blockedIps.push(ip); return { success: true, stdout: "", stderr: "" }; }
    async killProcess(pid: number): Promise<CommandResult> { this.killedPids.push(pid); return { success: true, stdout: "", stderr: "" }; }
    async unblockIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async isBlocked(_ip: string): Promise<boolean> { return false; }
    async shadowBanIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async lockdown(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async quarantineProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async enforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async unenforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getStatus(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async flushRules(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getBlockedIps(): Promise<string[]> { return this.blockedIps; }
    async allowPort(_port: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async denyPort(_port: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async setKv(_kv: any): Promise<void> {}
}

Deno.test("PlaybookService - Honeypot auto-block playbook", async () => {
    const logger = new MockLoggingPort();

    try {
    const eventBus = new EventBus(logger);
    const firewall = new MockFirewallPort();
    const pcap = { startCapture: async () => ({ success: true }) };
    const notifications = { notify: async () => {} };

    const { ServiceLocator } = await import("../src/orchestrator/core/service_locator.ts");
    const locator = new ServiceLocator();
    locator.register("eventBus", eventBus);
    locator.register("protection", { firewall, pcap });
    locator.register("notifications", notifications);
    locator.register("mesh", { isolateNode: () => {} });

    const service = new PlaybookService(logger);
    service.setLocator(locator);
    service.setEventBus(eventBus);
    await service.init();

    // Trigger HONEYPOT event
    eventBus.emit("HONEYPOT", { type: "PortAccess", source_ip: "10.0.0.99", port: 2222 });

    // Wait for async execution
    await new Promise(r => setTimeout(r, 100));

    assertEquals(firewall.blockedIps.includes("10.0.0.99"), true);
    assertEquals(logger.logs.some(l => l.message.includes("Honeypot trigger on port 2222")), true);

    await service.shutdown();
    } finally {
        // No stubs to restore
    }
});

Deno.test("PlaybookService - eBPF ptrace playbook", async () => {
    const logger = new MockLoggingPort();
    const eventBus = new EventBus(logger);
    const firewall = new MockFirewallPort();
    const shadowProtocol = { activated: false, activate: async () => { shadowProtocol.activated = true; } };

    const { ServiceLocator } = await import("../src/orchestrator/core/service_locator.ts");
    const locator = new ServiceLocator();
    locator.register("eventBus", eventBus);
    locator.register("protection", { firewall });
    locator.register("notifications", { notify: async () => {} });
    locator.register("mesh", { isolateNode: () => {} });
    locator.register("shadowProtocol", shadowProtocol);

    const service = new PlaybookService(logger);
    service.setLocator(locator);
    service.setEventBus(eventBus);
    await service.init();

    // Trigger EBPF_CRITICAL event with ptrace
    eventBus.emit("EBPF_CRITICAL", { pid: 999, comm: "injector", syscall: "ptrace" });

    await new Promise(r => setTimeout(r, 100));

    assertEquals(firewall.killedPids.includes(999), true);
    assertEquals(shadowProtocol.activated, true);
    assertEquals(logger.logs.some(l => l.message.includes("SUSPICIOUS PTRACE detected")), true);

    await service.shutdown();
});
