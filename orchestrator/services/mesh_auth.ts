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
      const nodeConf = `
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
`;
      await Deno.writeTextFile(nodeConfPath, nodeConf);

      // 1. Generate Node Key and CSR in memory
      const genReqCmd = new Deno.Command("openssl", {
        args: [
          "req", "-new", "-newkey", "rsa:2048",
          "-keyout", "/dev/stdout", "-out", "/dev/stdout",
          "-nodes", "-config", nodeConfPath, "-sha256"
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const reqOutput = await genReqCmd.output();
      if (!reqOutput.success) {
        throw new Error(`Failed to generate node request: ${new TextDecoder().decode(reqOutput.stderr)}`);
      }

      const reqPem = new TextDecoder().decode(reqOutput.stdout);
      const nodeKey = reqPem.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)?.[0];
      const nodeCsr = reqPem.match(/-----BEGIN CERTIFICATE REQUEST-----[\s\S]*?-----END CERTIFICATE REQUEST-----/)?.[0];

      if (!nodeKey || !nodeCsr) {
        throw new Error("Failed to extract node key or CSR from OpenSSL output");
      }

      await Deno.writeTextFile(nodeCsrPath, nodeCsr);

      // 2. Sign CSR using CA key from memory (via stdin)
      const signCmd = new Deno.Command("openssl", {
        args: [
          "x509", "-req", "-in", nodeCsrPath,
          "-CA", caCertPath, "-CAkey", "/dev/stdin",
          "-CAcreateserial", "-out", "/dev/stdout",
          "-days", "365", "-sha256", "-extfile", nodeConfPath, "-extensions", "v3_req"
        ],
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      });

      const signer = signCmd.spawn();
      const writer = signer.stdin.getWriter();
      await writer.write(new TextEncoder().encode(ca.key));
      await writer.close();

      const signOutput = await signer.output();
      if (!signOutput.success) {
        throw new Error(`Failed to sign certificate: ${new TextDecoder().decode(signOutput.stderr)}`);
      }

      const cert = new TextDecoder().decode(signOutput.stdout);

      return { cert, key: nodeKey, timestamp: Date.now() };
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  }

  private async generateSelfSignedCA(): Promise<CertPair> {
    const caConf = `
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
`;

    const genCaCmd = new Deno.Command("openssl", {
      args: [
        "req", "-x509", "-newkey", "rsa:4096",
        "-keyout", "/dev/stdout", "-out", "/dev/stdout",
        "-days", "3650", "-nodes", "-config", "/dev/stdin",
        "-sha256"
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = genCaCmd.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(caConf));
    await writer.close();

    const { success, stdout, stderr } = await child.output();
    if (!success) {
      throw new Error(`Failed to generate Root CA: ${new TextDecoder().decode(stderr)}`);
    }

    const output = new TextDecoder().decode(stdout);
    const cert = output.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
    const key = output.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)?.[0];

    if (!cert || !key) {
      throw new Error("Failed to extract CA cert or key from OpenSSL output");
    }

    return { cert, key, timestamp: Date.now() };
  }
}
