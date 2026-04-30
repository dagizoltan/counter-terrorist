import { MeshAuthPort } from "@core/ports.ts";
import { MeshAuthService } from "@services/index.ts";

export class MeshAuthAdapter implements MeshAuthPort {
  constructor(private service: MeshAuthService) {}
  async getRootCACert() {
    const ca = await this.service.getRootCA();
    return { cert: ca.cert, timestamp: ca.timestamp };
  }

  async generateNodeCert(nodeId: string) {
    return await this.service.generateNodeCert(nodeId);
  }

  async rotateCert(nodeId: string) {
    return await this.service.rotateCert(nodeId);
  }
}
