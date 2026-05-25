import { Plugin } from "../plugin_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { BroadcastFunction } from "./types.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export class RedisHoneypotPlugin implements Plugin {
  constructor(
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction,
  ) {}
  name = "redis_honeypot";
  description = "Simulates a vulnerable Redis instance to capture unauthorized credential stuffing.";
  private listener: Deno.TcpListener | null = null;
  private active = false;
  private port = 6379;

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start(): Promise<void> {
    try {
      this.listener = Deno.listen({ port: this.port });
      this.active = true;
      this.acceptConnections();
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.INFO,
          caller: "REDIS-HONEYPOT",
          message: `Listening on port ${this.port}`
      });
    } catch (e) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "REDIS-HONEYPOT",
          message: `Failed to start: ${(e as Error).message}`
      });
      this.active = false;
    }
  }

  private async acceptConnections() {
    if (!this.listener) return;
    for await (const conn of this.listener) {
      const remoteAddr = (conn.remoteAddr as Deno.NetAddr).hostname;
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.AUDIT,
          severity: LogSeverity.WARNING,
          caller: "REDIS-HONEYPOT",
          message: `Connection attempt from ${remoteAddr}`
      });

      this.broadcast({
        type: "CRITICAL",
        message: `Redis Honeypot Triggered: Connection from ${remoteAddr}`,
        data: { source_ip: remoteAddr, port: this.port }
      });

      try {
        await this.firewall.blockIp(remoteAddr);
      } catch (err) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "REDIS-HONEYPOT",
          message: `Failed to block IP ${remoteAddr}: ${err instanceof Error ? err.message : String(err)}`
        });
      }

      try {
        await this.pcap.startCapture("any", 30);
      } catch (err) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "REDIS-HONEYPOT",
          message: `PCAP failed for ${remoteAddr}: ${err instanceof Error ? err.message : String(err)}`
        });
      }

      // Simple Redis response and close
      try {
        await conn.write(new TextEncoder().encode("-ERR Unknown command\r\n"));
      } finally {
        conn.close();
      }
    }
  }

  async stop(): Promise<void> {
    this.active = false;
    if (this.listener) {
      this.listener.close();
      this.listener = null;
    }
  }
}
