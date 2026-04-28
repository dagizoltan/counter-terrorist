import { MeshPort } from "../core/ports.ts";
import { meshManager } from "../services/mesh.ts";

export class MeshAdapter implements MeshPort {
  async init(): Promise<void> {
    await meshManager.init();
  }

  startDiscovery(): void {
    meshManager.startDiscovery();
  }
}

export const meshAdapter = new MeshAdapter();
