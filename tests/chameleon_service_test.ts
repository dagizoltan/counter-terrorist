import { assertEquals } from "@std/assert";
import { ChameleonService } from "@domain/protection/chameleon_service.ts";
import { HoneypotService } from "@domain/protection/honeypot_service.ts";
import { CommandPort, FirewallPort, PcapPort, LoggingPort, CommandResult, LogEntry } from "@core/ports.ts";

class MockCommandPort implements CommandPort {
  commands: any[] = [];
  lastCommand: any = null;
  eventHandlers: Map<string, ((event: any) => void)> = new Map();

  async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
    this.commands.push({ sidecar, command });
    this.lastCommand = command;
    return { success: true, stdout: "", stderr: "" };
  }

  onEvent(sidecar: string, handler: (event: any) => void): void {
    this.eventHandlers.set(sidecar, handler);
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
    async blockIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async unblockIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async isBlocked(_ip: string): Promise<boolean> { return false; }
    async shadowBanIp(_ip: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async lockdown(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async killProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async quarantineProcess(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async enforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async unenforcePid(_pid: number): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getStatus(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async flushRules(): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async getBlockedIps(): Promise<string[]> { return []; }
    async allowPort(_port: number, _protocol?: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async denyPort(_port: number, _protocol?: string): Promise<CommandResult> { return { success: true, stdout: "", stderr: "" }; }
    async setKv(_kv: any): Promise<void> {}
}

class MockPcapPort implements PcapPort {
    async startCapture(_interface_name?: string, _duration?: number, _filename?: string, _filter?: string): Promise<CommandResult> {
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

Deno.test("ChameleonService - Add Redirection", async () => {
  const sidecarManager = new MockCommandPort();
  const logging = new MockLoggingPort();
  const firewall = new MockFirewallPort();
  const pcap = new MockPcapPort();
  const honeypot = new HoneypotService(sidecarManager, firewall, pcap, logging);
  const chameleon = new ChameleonService(sidecarManager, honeypot, logging);

  const destIp = "1.2.3.4";
  const destPort = 80;
  const decoyId = "http";

  const res = await chameleon.redirectToDecoy(destIp, destPort, decoyId);

  assertEquals(res.success, true);
  assertEquals(chameleon.getActiveRedirections().length, 1);
  assertEquals(sidecarManager.lastCommand?.type, "ADD_REDIRECTION");
  assertEquals(sidecarManager.lastCommand?.ip, destIp);
  assertEquals(sidecarManager.lastCommand?.new_port, 80);
});

Deno.test("ChameleonService - Remove Redirection", async () => {
  const sidecarManager = new MockCommandPort();
  const logging = new MockLoggingPort();
  const firewall = new MockFirewallPort();
  const pcap = new MockPcapPort();
  const honeypot = new HoneypotService(sidecarManager, firewall, pcap, logging);
  const chameleon = new ChameleonService(sidecarManager, honeypot, logging);

  const destIp = "1.2.3.4";
  const destPort = 80;

  await chameleon.redirectToDecoy(destIp, destPort, "http");
  const res = await chameleon.removeRedirection(destIp, destPort);

  assertEquals(res.success, true);
  assertEquals(chameleon.getActiveRedirections().length, 0);
  assertEquals(sidecarManager.lastCommand?.type, "REMOVE_REDIRECTION");
});

Deno.test("ChameleonService - Invalid Module", async () => {
  const sidecarManager = new MockCommandPort();
  const logging = new MockLoggingPort();
  const firewall = new MockFirewallPort();
  const pcap = new MockPcapPort();
  const honeypot = new HoneypotService(sidecarManager, firewall, pcap, logging);
  const chameleon = new ChameleonService(sidecarManager, honeypot, logging);

  const res = await chameleon.redirectToDecoy("1.1.1.1", 443, "non-existent");
  assertEquals(res.success, false);
});
