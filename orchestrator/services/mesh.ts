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
   * Starts node discovery.
   * Zero-config: Attempts mDNS first, then falls back to Subnet Scanning.
   */
  startDiscovery() {
    if (this.discoveryInterval) return;

    this.logging.log("[MESH] Starting zero-config node discovery...", SyslogSeverity.NOTICE);

    // 1. Initial Subnet Scan (Fast discovery)
    this.discoverSubnet();
    
    // 2. Schedule regular scans
    this.discoveryInterval = setInterval(() => {
        this.discoverSubnet();
        this.scanNetwork();
    }, 300000); // Every 5 minutes

    // 3. Start listening for mDNS (Passive discovery)
    this.listenForDiscovery();
  }

  private async discoverSubnet() {
    const interfaces = Deno.networkInterfaces();
    const localIps = interfaces
      .filter(i => i.family === "IPv4" && !i.address.startsWith("127."))
      .map(i => i.address);

    for (const ip of localIps) {
      const subnet = ip.split(".").slice(0, 3).join(".");
      this.logging.log(`[MESH] Probing subnet ${subnet}.0/24...`, SyslogSeverity.DEBUG);
      
      // Parallel probe with concurrency limit to avoid flooding
      const probes = [];
      for (let i = 1; i < 255; i++) {
        const targetIp = `${subnet}.${i}`;
        if (targetIp === ip) continue; // Skip self

        probes.push(this.probeNode(targetIp));
        
        if (probes.length >= 20) {
          await Promise.all(probes);
          probes.length = 0;
        }
      }
      await Promise.all(probes);
    }
  }

  private async probeNode(address: string) {
    try {
      const url = `http://${address}:${this.port}/api/mesh/ping`; // Try HTTP first for discovery
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.nodeId) {
          this.logging.log(`[MESH] Discovered potential peer at ${address}`, SyslogSeverity.NOTICE);
          this.validateAndRegisterNode({
            id: body.nodeId,
            hostname: body.nodeId,
            address,
            port: this.port,
            lastSeen: Date.now(),
            verified: false,
          });
        }
      }
    } catch {
      // Node not present or port closed
    }
  }

  private async listenForDiscovery() {
    try {
      // @ts-ignore
      if (typeof Deno.listenDatagram !== "function") return;

      const listener = Deno.listenDatagram({
        port: 5353,
        hostname: "0.0.0.0",
        transport: "udp",
      });

      this.logging.log("[MESH] Passive mDNS listener active", SyslogSeverity.NOTICE);

      for await (const [data, addr] of listener) {
        const msg = new TextDecoder().decode(data);
        if (msg.includes("_ct-orchestrator._tcp.local")) {
           const idMatch = msg.match(/id=([^,]+)/);
           const portMatch = msg.match(/port=(\d+)/);

           if (idMatch && portMatch) {
             const id = idMatch[1];
             const port = parseInt(portMatch[1]);
             const address = (addr as Deno.NetAddr).hostname;

             if (id !== this.nodeId) {
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
      // Silent fail
    }
  }

  private scanNetwork() {
    try {
      // @ts-ignore
      if (typeof Deno.listenDatagram !== "function") return;

      const txt = `id=${this.nodeId},port=${this.port}`;
      const announcement = `_ct-orchestrator._tcp.local|${txt}`;
      const message = new TextEncoder().encode(announcement);

      const socket = Deno.listenDatagram({ port: 0, transport: "udp" });
      socket.send(message, { transport: "udp", hostname: "224.0.0.251", port: 5353 });
      socket.close();
    } catch (e) {
      // Silent fail
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
   * Revokes trust from a node and removes it from the mesh.
   */
  isolateNode(nodeId: string) {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);
      this.logging.log(`[MESH] ISOLATED NODE: ${node.hostname} (${nodeId}) revoked from mesh due to security policy.`, SyslogSeverity.CRITICAL);
      broadcast({
        type: "CRITICAL",
        message: `Node ${node.hostname} isolated from mesh network!`,
        data: { nodeId }
      });
    }
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

  /**
   * Broadcasts a lockdown command to all verified nodes in the mesh.
   */
  async broadcastLockdown() {
    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
    if (verifiedNodes.length === 0) return;

    this.logging.log(`[MESH] Gossip: Broadcasting EMERGENCY LOCKDOWN to ${verifiedNodes.length} nodes...`, SyslogSeverity.EMERGENCY);

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_LOCKDOWN" }).catch(err => {
            console.warn(`[MESH] Failed to gossip lockdown with ${node.hostname}: ${err.message}`);
        });
    }
  }

  /**
   * Broadcasts a critical audit event to the mesh.
   */
  async broadcastAuditEvent(event: any) {
    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
    if (verifiedNodes.length === 0) return;

    for (const node of verifiedNodes) {
        this.sendSync(node, { type: "GOSSIP_AUDIT", event }).catch(err => {
            console.warn(`[MESH] Failed to gossip audit with ${node.hostname}: ${err.message}`);
        });
    }
  }

  async reconcile() {
    const verifiedNodes = Array.from(this.nodes.values()).filter(n => n.verified);
    for (const node of verifiedNodes) {
        try {
            await this.sendSync(node, { type: "FETCH_STATE" });
            console.log(`[MESH] Reconciled state with ${node.hostname}`);
        } catch (e) {
            console.warn(`[MESH] Failed to reconcile with ${node.hostname}: ${e.message}`);
        }
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
