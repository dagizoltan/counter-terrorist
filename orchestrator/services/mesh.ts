import { broadcast } from "../api/ws.ts";
import { MeshAuthService } from "./index.ts";
import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export interface MeshNode {
  id: string;
  hostname: string;
  address: string;
  port: number;
  lastSeen: number;
  /** Whether this node has been validated via mTLS handshake. */
  verified: boolean;
}

export class MeshManager {
  private nodes: Map<string, MeshNode> = new Map();
  private discoveryInterval: number | null = null;
  private nodeCert: any = null;
  private nodeId: string = "";
  private port: number = 8000;
  private httpClient: Deno.HttpClient | null = null;
  private meshSecret: string | undefined;

  constructor(private meshAuth: MeshAuthService, private logging: LoggingPort) {
    this.logging.log("[MESH] Initializing Mesh Infrastructure...", SyslogSeverity.NOTICE);
    this.meshSecret = Deno.env.get("MESH_SECRET");
  }

  async init() {
    this.nodeId = Deno.hostname() || "node-" + crypto.randomUUID().slice(0, 8);
    this.port = Number(Deno.env.get("PORT")) || 8000;

    try {
      this.nodeCert = await this.meshAuth.generateNodeCert(this.nodeId);

      // Create mTLS HTTP client
      this.httpClient = Deno.createHttpClient({
        cert: this.nodeCert.cert,
        key: this.nodeCert.key,
        caCerts: [(await this.meshAuth.getRootCA()).cert], // For mutual verification
      });

      this.logging.log(`[MESH] mTLS Identity established for ${this.nodeId}`, SyslogSeverity.NOTICE);
    } catch (e) {
      this.logging.log(`[MESH] Failed to initialize mTLS: ${e instanceof Error ? e.message : String(e)}. Continuing with limited mesh functionality.`, SyslogSeverity.WARNING);
    }
  }

  /**
   * Starts the mDNS discovery process to identify other nodes.
   */
  startDiscovery() {
    if (this.discoveryInterval) return;

    this.logging.log("[MESH] Starting mDNS node discovery...", SyslogSeverity.NOTICE);

    // Initial scan and then every minute
    this.scanNetwork();
    this.discoveryInterval = setInterval(() => {
        this.scanNetwork();
    }, 60000);

    // Start listening for mDNS responses/queries
    this.listenForDiscovery();
  }

  private async listenForDiscovery() {
    try {
      const listener = Deno.listenDatagram({
        port: 5353,
        hostname: "0.0.0.0",
        transport: "udp",
      });

      this.logging.log("[MESH] Listening for mDNS on 224.0.0.251:5353", SyslogSeverity.NOTICE);

      for await (const [data, addr] of listener) {
        // More robust mDNS check: look for _ct-orchestrator._tcp.local
        const msg = new TextDecoder().decode(data);
        if (msg.includes("_ct-orchestrator._tcp.local")) {
           // Basic extraction from simulated DNS-SD TXT record
           const idMatch = msg.match(/id=([^,]+)/);
           const portMatch = msg.match(/port=(\d+)/);

           if (idMatch && portMatch) {
             const id = idMatch[1];
             const port = parseInt(portMatch[1]);
             const address = (addr as Deno.NetAddr).hostname;

             if (id !== this.nodeId) {
               // Security: Don't trust mDNS alone — validate via mTLS before accepting
               this.validateAndRegisterNode({
                 id,
                 hostname: id,
                 address,
                 port,
                 lastSeen: Date.now(),
                 verified: false,
               });
             }
           }
        }
      }
    } catch (e) {
      console.warn("[MESH] mDNS listener failed:", e instanceof Error ? e.message : String(e));
    }
  }

  private scanNetwork() {
    // Construct a simulated DNS-SD announcement
    // Format: _ct-orchestrator._tcp.local TXT id=NODEID,port=PORT
    const txt = `id=${this.nodeId},port=${this.port}`;
    const announcement = `_ct-orchestrator._tcp.local|${txt}`;
    const message = new TextEncoder().encode(announcement);

    try {
      const socket = Deno.listenDatagram({ port: 0, transport: "udp" });
      socket.send(message, { transport: "udp", hostname: "224.0.0.251", port: 5353 });
      socket.close();
    } catch (e) {
      console.error("[MESH] Failed to send mDNS broadcast", e);
    }
  }

  /**
   * Validates a discovered node via mTLS handshake before trusting it.
   * An mDNS announcement alone is not sufficient — any LAN host can spoof one.
   */
  private async validateAndRegisterNode(node: MeshNode) {
    // If already known and verified, just update lastSeen
    const existing = this.nodes.get(node.id);
    if (existing?.verified) {
      existing.lastSeen = Date.now();
      return;
    }

    if (!this.httpClient) {
      this.logging.log(
        `[MESH] Cannot validate node ${node.id} — mTLS client not initialized. Skipping.`,
        SyslogSeverity.WARNING
      );
      return;
    }

    try {
      // Attempt mTLS handshake by hitting the node's /api/mesh/ping endpoint
      const url = `https://${node.address}:${node.port}/api/mesh/ping`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.meshSecret) {
        headers["X-Mesh-Secret"] = this.meshSecret;
      }

      const res = await fetch(url, {
        method: "GET",
        headers,
        client: this.httpClient,
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!res.ok) {
        throw new Error(`Ping returned status ${res.status}`);
      }

      const body = await res.json();
      if (body.success && body.nodeId) {
        // Verified — the node presented a valid mTLS certificate signed by our CA
        node.verified = true;
        this.registerNode(node);
        this.logging.log(
          `[MESH] Node ${node.id} at ${node.address}:${node.port} passed mTLS validation.`,
          SyslogSeverity.NOTICE
        );
      } else {
        throw new Error("Invalid ping response");
      }
    } catch (e) {
      this.logging.log(
        `[MESH] REJECTED node ${node.id} at ${node.address}:${node.port} — mTLS validation failed: ${e instanceof Error ? e.message : String(e)}`,
        SyslogSeverity.WARNING
      );
    }
  }

  registerNode(node: MeshNode) {
    const isNew = !this.nodes.has(node.id);
    this.nodes.set(node.id, { ...node, lastSeen: Date.now() });

    if (isNew) {
      this.logging.log(`[MESH] New node registered: ${node.hostname} (${node.address}:${node.port}) [verified=${node.verified}]`, SyslogSeverity.NOTICE);
      broadcast({
        type: "INFO",
        message: `New security node joined the mesh: ${node.hostname}`,
        data: node
      });
    }
  }

  getNodes(): MeshNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Broadcasts a block command to all verified nodes in the mesh.
   */
  async broadcastBlock(ip: string) {
    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log(`[MESH] Gossip: Broadcasting block for ${ip} to ${verifiedNodes.length} verified nodes...`, SyslogSeverity.NOTICE);

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_BLOCK", ip }).catch(err => {
            console.warn(`[MESH] Failed to gossip with ${node.hostname}: ${err.message}`);
        });
    }
  }

  private async sendSync(node: MeshNode, payload: any) {
    if (!this.httpClient) await this.init();

    const url = `https://${node.address}:${node.port}/api/mesh/sync`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.meshSecret) {
      headers["X-Mesh-Secret"] = this.meshSecret;
    }

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        client: this.httpClient!
    });

    if (!res.ok) {
      throw new Error(`Sync failed with status ${res.status}`);
    }

    console.log(`[MESH] mTLS Sync sent to ${node.address}:${node.port}`);
  }
}

export let meshManager: MeshManager;

export function setMeshManager(instance: MeshManager) {
  meshManager = instance;
}
