import { Result } from "../result.ts";

export interface MeshPort {
  init(): Promise<import("../result.ts").Result<void>>;
  shutdown(): Promise<import("../result.ts").Result<void>>;
  startDiscovery(): void;
  getNodeId(): string;
  getActiveNodeCount(): number;
  getNodes(): unknown[];
  isolateNode(nodeId: string): import("../result.ts").Result<void>;
  broadcastThreatHash(hash: string, sourceNode: string): Promise<import("../result.ts").Result<void>>;
  broadcastAuditEvent(event: unknown): Promise<void>;
  broadcastAuditVerification(lastHash: string, eventCount: number): Promise<void>;
  broadcastBlock(ip: string): Promise<import("../result.ts").Result<void>>;
  broadcastLockdown(): Promise<import("../result.ts").Result<void>>;
  broadcastQuarantine?(source: string): Promise<import("../result.ts").Result<void>>;
  rotateIdentity?(): Promise<import("../result.ts").Result<void>>;
  requestAuditSync(nodeId: string): Promise<void>;
}

export interface MeshAuthPort {
  getRootCA(): Promise<Result<{ cert: string; key: string }>>;
  getTrustedCerts(): Promise<string[]>;
  generateNodeCert(nodeId: string): Promise<Result<{ cert: string; key: string }>>;
  generateProxyNodeCert(nodeId: string): Promise<Result<{ cert: string }>>;
  signWithNodeKey(nodeId: string, data: string): Promise<Result<string>>;
  rotateCert(nodeId: string): Promise<Result<{ cert: string; key: string }>>;
  stageSecondarySecret(secret: string): void;
  commitSecretSwap(): void;
  validateMeshSecret(provided: string): boolean;
}
