import { MeshAuthPort } from "../core/ports.ts";
import { meshAuth } from "../services/mesh_auth.ts";

export class MeshAuthAdapter implements MeshAuthPort {
  async getRootCACert() {
    const ca = await meshAuth.getRootCA();
    return { cert: ca.cert, timestamp: ca.timestamp };
  }

  async generateNodeCert(nodeId: string) {
    return await meshAuth.generateNodeCert(nodeId);
  }

  async rotateCert(nodeId: string) {
    return await meshAuth.rotateCert(nodeId);
  }
}

export const meshAuthAdapter = new MeshAuthAdapter();
