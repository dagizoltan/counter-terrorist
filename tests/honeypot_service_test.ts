import { assertEquals, assertExists } from "@std/assert";
import { HoneypotService } from "@domain/protection/honeypot_service.ts";
import { CommandPort, FirewallPort, PcapPort, LoggingPort, CommandResult, LogEntry } from "@core/ports.ts";
import { Result } from "@core/result.ts";

class MockCommandPort implements CommandPort {
  commands: any[] = [];
  responses: Map<string, CommandResult> = new Map();
  eventHandlers: Map<string, ((event: any) => void)> = new Map();

  async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
    this.commands.push({ sidecar, command });
    if (this.responses.has(sidecar + ":" + command.type)) {
        return this.responses.get(sidecar + ":" + command.type)!;
    }
    return { success: true, stdout: "", stderr: "" };
  }

  onEvent(sidecar: string, handler: (event: any) => void): void {
    this.eventHandlers.set(sidecar, handler);
  }

  emitEvent(sidecar: string, event: any): void {
    const handler = this.eventHandlers.get(sidecar);
    if (handler) handler(event);
  }

  async getPersistentSidecar(_sidecar: string): Promise<any> {
    return { pid: 1234 };
  }

  isRunning(_sidecar: string): boolean { return true; }
  async restartSidecar(_sidecar: string): Promise<void> {}
  async stopSidecar(_sidecar: string): Promise<void> {}
  getPID(_sidecar: string): number | null { return 1234; }
  getTpm(): any { return null; }
  getExecutor(): any {
    return {
        execute: async () => ({ success: true, stdout: "", stderr: "" })
    };
  }
}

class MockFirewallPort implements FirewallPort {
    calls: any[] = [];
    async blockIp(ip: string): Promise<CommandResult> { this.calls.push({ method: 'blockIp', ip }); return { success: true, stdout: "", stderr: "" }; }
    async unblockIp(ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async isBlocked(_ip: string): Promise<boolean> { return false; }
    async shadowBanIp(ip: string): Promise<CommandResult> { this.calls.push({ method: 'shadowBanIp', ip }); return { success: true, stdout: "", stderr: "" }; }
    async lockdown(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async killProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async quarantineProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async enforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async unenforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getStatus(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async flushRules(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getBlockedIps(): Promise<string[]> { return []; }
    async allowPort(port: number, protocol?: string): Promise<CommandResult> { this.calls.push({ method: 'allowPort', port, protocol }); return { success: true, stdout: "", stderr: "" }; }
    async denyPort(port: number, protocol?: string): Promise<CommandResult> { this.calls.push({ method: 'denyPort', port, protocol }); return { success: true, stdout: "", stderr: "" }; }
    async setKv(_kv: any): Promise<void> {}
}

class MockPcapPort implements PcapPort {
    calls: any[] = [];
    async startCapture(interface_name?: string, duration?: number, filename?: string, filter?: string): Promise<CommandResult> {
        this.calls.push({ method: 'startCapture', interface_name, duration, filename, filter });
        return { success: true, stdout: "", stderr: "" };
    }
    async stopCapture(_filename: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
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

Deno.test("HoneypotService - Initialization and start", async () => {
    const sidecar = new MockCommandPort();
    const firewall = new MockFirewallPort();
    const pcap = new MockPcapPort();
    const logging = new MockLoggingPort();
    const service = new HoneypotService(sidecar, firewall, pcap, logging);

    const result = await service.start();
    assertEquals(result.success, true);

    // Check if decoy sidecar was started and listeners registered
    assertExists(sidecar.eventHandlers.get("decoy"));

    await service.shutdown();
});

Deno.test("HoneypotService - Toggle Module", async () => {
    const sidecar = new MockCommandPort();
    const firewall = new MockFirewallPort();
    const pcap = new MockPcapPort();
    const logging = new MockLoggingPort();
    const service = new HoneypotService(sidecar, firewall, pcap, logging);

    // Toggle redis module (initially inactive)
    await service.toggleModule("redis", true);

    // Verify firewall rule and sidecar command
    assertEquals(firewall.calls.some(c => c.method === "allowPort" && c.port === 6379), true);
    assertEquals(sidecar.commands.some(c => c.command.type === "ToggleModule" && c.command.module === "redis" && c.command.active === true), true);

    await service.shutdown();
});

Deno.test("HoneypotService - Handle PortAccess Event", async () => {
    const sidecar = new MockCommandPort();
    const firewall = new MockFirewallPort();
    const pcap = new MockPcapPort();
    const logging = new MockLoggingPort();
    const service = new HoneypotService(sidecar, firewall, pcap, logging);

    const eventBus = {
        emit: (type: string, data: any) => {
            if (type === "HONEYPOT") {
                assertEquals(data.source_ip, "1.2.3.4");
                assertEquals(data.port, 22);
            }
        }
    };
    service.setEventBus(eventBus);
    await service.start();

    // Simulate event from sidecar
    sidecar.emitEvent("decoy", { data: { type: "PortAccess", source_ip: "1.2.3.4", port: 22 } });

    // Give async handlers a moment to execute
    await new Promise(r => setTimeout(r, 100));

    // Verify logging and forensics
    assertEquals(logging.logs.some(l => l.message.includes("Tactical Trigger")), true);
    assertEquals(pcap.calls.some(c => c.method === "startCapture" && c.filter.includes("1.2.3.4")), true);

    await service.shutdown();
});

Deno.test("HoneypotService - Morph Logic", async () => {
    const sidecar = new MockCommandPort();
    const firewall = new MockFirewallPort();
    const pcap = new MockPcapPort();
    const logging = new MockLoggingPort();
    const service = new HoneypotService(sidecar, firewall, pcap, logging);

    await service.start();

    const sshModule = service.getModule("ssh");
    const oldPort = sshModule?.port;

    await service.morph();

    const newPort = sshModule?.port;
    assertEquals(newPort !== oldPort, true);

    // Verify firewall calls (allow new, deny old)
    assertEquals(firewall.calls.some(c => c.method === "allowPort" && c.port === newPort), true);
    assertEquals(firewall.calls.some(c => c.method === "denyPort" && c.port === oldPort), true);

    await service.shutdown();
});

Deno.test("HoneypotService - Morph Rollback on Firewall Failure", async () => {
    const sidecar = new MockCommandPort();
    const firewall = new MockFirewallPort();
    const pcap = new MockPcapPort();
    const logging = new MockLoggingPort();
    const service = new HoneypotService(sidecar, firewall, pcap, logging);

    await service.start();

    const sshModule = service.getModule("ssh");
    const oldPort = sshModule?.port;

    // Mock firewall failure for ANY port that isn't the current one
    firewall.allowPort = async (port: number) => {
        if (port !== oldPort) return { success: false, stdout: "", stderr: "Firewall error" };
        return { success: true, stdout: "", stderr: "" };
    };

    await service.morph();

    // Port should NOT have changed (rolled back)
    assertEquals(sshModule?.port, oldPort);

    // Verify sidecar was told to move back
    assertEquals(sidecar.commands.some(c => c.command.type === "UpdateModule" && c.command.new_port === oldPort), true);

    await service.shutdown();
});
