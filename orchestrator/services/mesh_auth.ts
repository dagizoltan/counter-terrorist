/**
 * Mesh Authentication Service: Manages the internal PKI for mTLS communication.
 * Stores certificates and keys in Deno KV for persistence and cross-node sync.
 */

export interface CertPair {
  cert: string;
  key: string;
  timestamp: number;
}

export class MeshAuthService {
  private readonly CA_KEY = ["mesh", "pki", "root_ca"];
  private readonly NODES_PREFIX = ["mesh", "pki", "nodes"];

  constructor(private kv: Deno.Kv) {}

  /**
   * Generates or retrieves the root CA for the mesh.
   */
  async getRootCA(): Promise<CertPair> {
    const entry = await this.kv.get<CertPair>(this.CA_KEY);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    if (entry.value && entry.value.timestamp > thirtyDaysAgo) {
      return entry.value;
    }

    console.log("[PKI] CA is missing or older than 30 days. Generating/Regenerating Root CA...");
    const ca = await this.generateSelfSignedCA();
    await this.kv!.set(this.CA_KEY, ca);

    // If we regenerated the CA, we MUST regenerate all node certs
    if (entry.value) {
      await this.rotateAllNodeCerts();
    }

    return ca;
  }

  /**
   * Generates a signed certificate for a node.
   */
  async generateNodeCert(nodeId: string): Promise<CertPair> {
    const nodeKey = [...this.NODES_PREFIX, nodeId];
    const entry = await this.kv.get<CertPair>(nodeKey);

    if (entry.value) return entry.value;

    const certPair = await this.issueNodeCert(nodeId);
    await this.kv!.set(nodeKey, certPair);
    return certPair;
  }

  /**
   * Rotates a specific node certificate.
   */
  async rotateCert(nodeId: string): Promise<CertPair> {
    const certPair = await this.issueNodeCert(nodeId);
    await this.kv.set([...this.NODES_PREFIX, nodeId], certPair);
    return certPair;
  }

  private async rotateAllNodeCerts() {
    console.log("[PKI] Rotating all node certificates due to CA regeneration...");
    const iter = this.kv.list<CertPair>({ prefix: this.NODES_PREFIX });
    for await (const entry of iter) {
      const nodeId = entry.key[entry.key.length - 1] as string;
      await this.rotateCert(nodeId);
    }
  }

  private async issueNodeCert(nodeId: string): Promise<CertPair> {
    const ca = await this.getRootCA();
    const tempDir = await Deno.makeTempDir();
    const caCertPath = `${tempDir}/ca.crt`;
    const caKeyPath = `${tempDir}/ca.key`;
    const nodeKeyPath = `${tempDir}/node.key`;
    const nodeCsrPath = `${tempDir}/node.csr`;
    const nodeCertPath = `${tempDir}/node.crt`;

    try {
      await Deno.writeTextFile(caCertPath, ca.cert);
      await Deno.writeTextFile(caKeyPath, ca.key);

      // 1. Generate Node Key
      const genKeyCmd = await new Deno.Command("openssl", {
        args: ["genrsa", "-out", nodeKeyPath, "2048"],
      }).output();
      if (!genKeyCmd.success) throw new Error(`Failed to generate node key: ${new TextDecoder().decode(genKeyCmd.stderr)}`);

      // 2. Generate CSR
      const genCsrCmd = await new Deno.Command("openssl", {
        args: ["req", "-new", "-key", nodeKeyPath, "-out", nodeCsrPath, "-subj", `/CN=${nodeId}`],
      }).output();
      if (!genCsrCmd.success) throw new Error(`Failed to generate CSR: ${new TextDecoder().decode(genCsrCmd.stderr)}`);

      // 3. Sign CSR
      const signCmd = await new Deno.Command("openssl", {
        args: [
          "x509", "-req", "-in", nodeCsrPath,
          "-CA", caCertPath, "-CAkey", caKeyPath,
          "-CAcreateserial", "-out", nodeCertPath,
          "-days", "365"
        ],
      }).output();
      if (!signCmd.success) throw new Error(`Failed to sign certificate: ${new TextDecoder().decode(signCmd.stderr)}`);

      const cert = await Deno.readTextFile(nodeCertPath);
      const key = await Deno.readTextFile(nodeKeyPath);

      return { cert, key, timestamp: Date.now() };
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  private async generateSelfSignedCA(): Promise<CertPair> {
    const tempDir = await Deno.makeTempDir();
    const caKeyPath = `${tempDir}/ca.key`;
    const caCertPath = `${tempDir}/ca.crt`;

    try {
      const genCaCmd = await new Deno.Command("openssl", {
        args: [
          "req", "-x509", "-newkey", "rsa:4096",
          "-keyout", caKeyPath, "-out", caCertPath,
          "-days", "3650", "-nodes", "-subj", "/CN=MeshRootCA"
        ],
      }).output();
      if (!genCaCmd.success) throw new Error(`Failed to generate Root CA: ${new TextDecoder().decode(genCaCmd.stderr)}`);

      const cert = await Deno.readTextFile(caCertPath);
      const key = await Deno.readTextFile(caKeyPath);

      return { cert, key, timestamp: Date.now() };
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }
}

