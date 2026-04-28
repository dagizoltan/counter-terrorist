import { broadcast } from "../api/ws.ts";

export interface MeshNode {
  id: string;
  hostname: string;
  address: string;
  lastSeen: number;
}

export class MeshManager {
  private nodes: Map<string, MeshNode> = new Map();
  private discoveryInterval: number | null = null;

  constructor() {
    console.log("[MESH] Initializing Mesh Infrastructure...");
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
    console.log(`[MESH] Broadcasting block for ${ip} to ${this.nodes.size} nodes...`);
    // Phase 3.2: Implement mTLS-encrypted RPC calls to peer nodes
  }
}

export const meshManager = new MeshManager();
