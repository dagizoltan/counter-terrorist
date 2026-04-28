import { broadcast } from "../api/ws.ts";
import { meshAuth } from "./mesh_auth.ts";

export interface MeshNode {
  id: string;
  hostname: string;
  address: string;
  lastSeen: number;
}

export class MeshManager {
  private nodes: Map<string, MeshNode> = new Map();
  private discoveryInterval: number | null = null;
  private nodeCert: any = null;

  constructor() {
    console.log("[MESH] Initializing Mesh Infrastructure...");
  }

  async init() {
    const nodeId = Deno.hostname() || "node-" + crypto.randomUUID().slice(0, 8);
    this.nodeCert = await meshAuth.generateNodeCert(nodeId);
    console.log(`[MESH] mTLS Identity established for ${nodeId}`);
  }

  /**
   * Starts the mDNS discovery process to identify other nodes.
   * Note: In a real implementation, we would use a library like 'deno-mdns'.
   * For this baseline, we simulate the discovery logic.
   */
  startDiscovery() {
    if (this.discoveryInterval) return;

    console.log("[MESH] Starting mDNS node discovery...");

    // Simulation: In Phase 3.1, this will be replaced with real mDNS listeners
    this.discoveryInterval = setInterval(() => {
        this.scanNetwork();
    }, 60000); // Scan every minute
  }

  private scanNetwork() {
    // Placeholder for actual discovery logic
    // eventBus.publish("INFO", "Mesh discovery scan initiated");
  }

  registerNode(node: MeshNode) {
    const isNew = !this.nodes.has(node.id);
    this.nodes.set(node.id, { ...node, lastSeen: Date.now() });

    if (isNew) {
      console.log(`[MESH] New node discovered: ${node.hostname} (${node.address})`);
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
   * Broadcasts a block command to all discovered nodes in the mesh.
   */
  async broadcastBlock(ip: string) {
    if (this.nodes.size === 0) return;

    console.log(`[MESH] Gossip: Broadcasting block for ${ip} to ${this.nodes.size} nodes...`);

    for (const node of this.nodes.values()) {
        this.sendSync(node, { type: "GOSSIP_BLOCK", ip }).catch(err => {
            console.warn(`[MESH] Failed to gossip with ${node.hostname}: ${err.message}`);
        });
    }
  }

  private async sendSync(node: MeshNode, payload: any) {
    // In Phase 4.1, we use mTLS fetch to peer nodes
    /*
    const res = await fetch(`https://${node.address}:8000/api/mesh/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        clientCert: this.nodeCert.cert,
        clientKey: this.nodeCert.key
    });
    */
    console.log(`[MESH] mTLS Sync sent to ${node.address} (Simulation)`);
  }
}

export const meshManager = new MeshManager();
