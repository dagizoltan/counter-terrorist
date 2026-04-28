import { Plugin } from "../plugin_manager.ts";
import { broadcast } from "../api/ws.ts";
import { firewall } from "../protection/firewall.ts";
import { pcap } from "../protection/pcap.ts";

export class SshHoneypotPlugin implements Plugin {
  name = "ssh_honeypot";
  private listener: Deno.TcpListener | null = null;
  private active = false;
  private port = 2222; // Use non-standard port for testing or different from sidecar

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    return this.active ? "ACTIVE" : "INACTIVE";
  }

  async start() {
    try {
      this.listener = Deno.listen({ port: this.port });
      this.active = true;
      this.acceptConnections();
      console.log(`[SSH-HONEYPOT] Listening on port ${this.port}`);
    } catch (e) {
      console.error(`[SSH-HONEYPOT] Failed to start: ${e}`);
      this.active = false;
    }
  }

  private async acceptConnections() {
    if (!this.listener) return;
    for await (const conn of this.listener) {
      const remoteAddr = (conn.remoteAddr as Deno.NetAddr).hostname;
      console.warn(`[SSH-HONEYPOT] Connection attempt from ${remoteAddr}`);

      broadcast({
        type: "CRITICAL",
        message: `SSH Honeypot Triggered: Connection from ${remoteAddr}`,
        data: { source_ip: remoteAddr, port: this.port }
      });

      firewall.blockIp(remoteAddr).catch(console.error);
      pcap.startCapture("any", 30).catch(console.error);

      // Send a fake SSH banner and close
      try {
        await conn.write(new TextEncoder().encode("SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.1\r\n"));
        await new Promise(r => setTimeout(r, 1000));
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
