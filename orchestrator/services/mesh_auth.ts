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
  private readonly CA_KEY = ["mesh", "pki", "root_ca_v4"];
  private readonly NODES_PREFIX = ["mesh", "pki", "nodes_v2"];

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
    const nodeConfPath = `${tempDir}/node.conf`;
    const nodeCsrPath = `${tempDir}/node.csr`;

    try {
      await Deno.writeTextFile(caCertPath, ca.cert);
      await Deno.writeTextFile(nodeConfPath, `
[req]
distinguished_name = req_distinguished_name
prompt = no
[req_distinguished_name]
CN = ${nodeId}
[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth, serverAuth
subjectKeyIdentifier = hash
`);

      // 1. Generate Node Key (In-Memory)
      const genKeyOutput = await new Deno.Command("openssl", {
        args: ["genrsa", "2048"],
      }).output();
      if (!genKeyOutput.success) throw new Error(`Failed to generate node key: ${new TextDecoder().decode(genKeyOutput.stderr)}`);
      const key = new TextDecoder().decode(genKeyOutput.stdout);

      // 2. Generate CSR (In-Memory Key)
      const genCsrCmd = new Deno.Command("openssl", {
        args: ["req", "-new", "-key", "/dev/stdin", "-config", nodeConfPath, "-out", nodeCsrPath],
        stdin: "piped",
      });
      const genCsrChild = genCsrCmd.spawn();
      const csrWriter = genCsrChild.stdin.getWriter();
      await csrWriter.write(new TextEncoder().encode(key));
      await csrWriter.close();
      const csrStatus = await genCsrChild.status;
      if (!csrStatus.success) throw new Error("Failed to generate CSR");

      // 3. Sign CSR (In-Memory CA Key)
      const signCmd = new Deno.Command("openssl", {
        args: [
          "x509", "-req", "-in", nodeCsrPath,
          "-CA", caCertPath, "-CAkey", "/dev/stdin",
          "-CAcreateserial",
          "-days", "365", "-sha256", "-extfile", nodeConfPath, "-extensions", "v3_req"
        ],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });
      const signChild = signCmd.spawn();
      const signWriter = signChild.stdin.getWriter();
      await signWriter.write(new TextEncoder().encode(ca.key));
      await signWriter.close();

      const { success, stdout, stderr } = await signChild.output();
      if (!success) throw new Error(`Failed to sign certificate: ${new TextDecoder().decode(stderr)}`);
      const cert = new TextDecoder().decode(stdout);

      return { cert, key, timestamp: Date.now() };
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  private async generateSelfSignedCA(): Promise<CertPair> {
    const tempDir = await Deno.makeTempDir();
    const caConfPath = `${tempDir}/ca.conf`;

    try {
      await Deno.writeTextFile(caConfPath, `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no
[req_distinguished_name]
CN = MeshRootCA
[v3_ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
`);

      // 1. Generate CA Key (In-Memory)
      const genKeyOutput = await new Deno.Command("openssl", {
        args: ["genrsa", "4096"],
      }).output();
      if (!genKeyOutput.success) throw new Error("Failed to generate CA key");
      const key = new TextDecoder().decode(genKeyOutput.stdout);

      // 2. Generate CA Certificate (In-Memory Key)
      const genCertCmd = new Deno.Command("openssl", {
        args: [
          "req", "-x509", "-new",
          "-key", "/dev/stdin",
          "-days", "3650", "-config", caConfPath,
          "-sha256"
        ],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });
      const genCertChild = genCertCmd.spawn();
      const writer = genCertChild.stdin.getWriter();
      await writer.write(new TextEncoder().encode(key));
      await writer.close();

      const { success, stdout, stderr } = await genCertChild.output();
      if (!success) throw new Error(`Failed to generate Root CA: ${new TextDecoder().decode(stderr)}`);
      const cert = new TextDecoder().decode(stdout);

      return { cert, key, timestamp: Date.now() };
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }
}

