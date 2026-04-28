import { MeshPort } from "../core/ports.ts";
import { MeshManager } from "../services/mesh.ts";

export class MeshAdapter implements MeshPort {
  constructor(private service: MeshManager) {}
  async init(): Promise<void> {
    await this.service.init();
  }

  startDiscovery(): void {
    this.service.startDiscovery();
  }
}
