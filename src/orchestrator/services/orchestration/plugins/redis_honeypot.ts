import { Plugin } from "../plugin_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap.ts";
import { BroadcastFunction } from "./types.ts";

export class RedisHoneypotPlugin implements Plugin {
  constructor(
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction,
  ) {}
  name = "redis_honeypot";
  private listener: Deno.TcpListener | null = null;
  private active = false;
  private port = 6379;

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    try {
      this.listener = Deno.listen({ port: this.port });
      this.active = true;
      this.acceptConnections();
      console.log(`[REDIS-HONEYPOT] Listening on port ${this.port}`);
    } catch (e) {
      console.error(`[REDIS-HONEYPOT] Failed to start: ${e}`);
      this.active = false;
    }
  }

  private async acceptConnections() {
    if (!this.listener) return;
    for await (const conn of this.listener) {
      const remoteAddr = (conn.remoteAddr as Deno.NetAddr).hostname;
      console.warn(`[REDIS-HONEYPOT] Connection attempt from ${remoteAddr}`);

      this.broadcast({
        type: "CRITICAL",
        message: `Redis Honeypot Triggered: Connection from ${remoteAddr}`,
        data: { source_ip: remoteAddr, port: this.port }
      });

      this.firewall.blockIp(remoteAddr).catch(console.error);
      this.pcap.startCapture("any", 30).catch(console.error);

      // Simple Redis response and close
      try {
        await conn.write(new TextEncoder().encode("-ERR Unknown command\r\n"));
      } finally {
        conn.close();
      }
    }
  }

  async stop() {
    this.active = false;
    if (this.listener) {
      this.listener.close();
      this.listener = null;
    }
  }
}
