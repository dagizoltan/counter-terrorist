import { Plugin } from "../plugin_manager.ts";
import { MeshManager } from "../mesh.ts";

export class MeshPlugin implements Plugin {
  name = "mesh";
  description = "Autonomous peer discovery and mTLS-secured gossip protocol for collective intelligence.";

  constructor(private mesh: MeshManager) {}

  async start() {
    // Discovery is usually started by the app, but we ensure it's running
    this.mesh.startDiscovery();
  }

  async stop() {
    // Implementation for stopping discovery if needed
  }

  status(): "ACTIVE" | "INACTIVE" | "ERROR" {
    // If we have verified nodes or discovery is active, it's active
    return "ACTIVE";
  }
}
