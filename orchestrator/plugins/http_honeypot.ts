import { HoneypotPlugin, HoneypotConfig } from "./manager.ts";
import { broadcast } from "../api/ws.ts";

export class HttpHoneypot implements HoneypotPlugin {
  config: HoneypotConfig = {
    name: "http_lure",
    description: "A simple HTTP honeypot that logs any incoming connections.",
    port: 8080,
  };

  private server: Deno.HttpServer | null = null;
  private abortController: AbortController | null = null;

  async start(): Promise<boolean> {
    if (this.status()) return true;

    try {
      this.abortController = new AbortController();

      this.server = Deno.serve({
        port: this.config.port,
        hostname: "0.0.0.0",
        signal: this.abortController.signal,
        onListen: ({ port, hostname }) => {
          console.log(`[HONEYPOT] ${this.config.name} listening on ${hostname}:${port}`);
        }
      }, async (req, info) => {
        const clientIp = info.remoteAddr.hostname;
        const method = req.method;
        const url = req.url;

        const message = `Honeypot hit! [${this.config.name}] Connection from ${clientIp} - ${method} ${url}`;
        console.warn(`[HONEYPOT: ${this.config.name}] ${message}`);

        broadcast({
          type: "CRITICAL",
          message: "Honeypot Intrusion Detected!",
          data: {
            honeypot: this.config.name,
            ip: clientIp,
            method: method,
            url: url,
            timestamp: new Date().toISOString()
          }
        });

        // Simulate a vulnerable or fake server response
        return new Response("Server Error", { status: 500 });
      });

      return true;
    } catch (e) {
      console.error(`[HONEYPOT] Failed to start ${this.config.name}:`, e);
      return false;
    }
  }

  async stop(): Promise<boolean> {
    if (!this.status()) return true;

    try {
      this.abortController?.abort();
      this.server = null;
      this.abortController = null;
      console.log(`[HONEYPOT] ${this.config.name} stopped.`);
      return true;
    } catch (e) {
      console.error(`[HONEYPOT] Failed to stop ${this.config.name}:`, e);
      return false;
    }
  }

  status(): boolean {
    return this.server !== null;
  }
}

// Automatically register upon import if needed, or register in a bootstrapper.
// For now, we will just export the class.
