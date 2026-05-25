import { Plugin } from "../plugin_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { BroadcastFunction } from "./types.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export class SshHoneypotPlugin implements Plugin {
  constructor(
    private firewall: FirewallManager,
    private pcap: PcapManager,
    private broadcast: BroadcastFunction,
  ) {}
  name = "ssh_honeypot";
  description = "Provides high-interaction SSH deception to trap and identify brute-force attackers.";
  private listener: Deno.TcpListener | null = null;
  private active = false;
  private port = 2222; // Use non-standard port for testing or different from sidecar

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
          caller: "SSH-HONEYPOT",
          message: `Listening on port ${this.port}`
      });
    } catch (e) {
      loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "SSH-HONEYPOT",
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
          caller: "SSH-HONEYPOT",
          message: `Connection attempt from ${remoteAddr}`
      });

      this.broadcast({
        type: "AUDIT_EVENT",
        data: {
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "decoy:ssh",
            message: `SSH Honeypot Triggered: Connection from ${remoteAddr}`,
            data: { source_ip: remoteAddr, port: this.port }
        }
      });

      try {
        await this.firewall.blockIp(remoteAddr);
      } catch (err) {
        loggingService.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "SSH-HONEYPOT",
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
          caller: "SSH-HONEYPOT",
          message: `PCAP failed for ${remoteAddr}: ${err instanceof Error ? err.message : String(err)}`
        });
      }

      // Send a fake SSH banner and close
      try {
        await conn.write(new TextEncoder().encode("SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.1\r\n"));
        await new Promise(r => setTimeout(r, 1000));
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
