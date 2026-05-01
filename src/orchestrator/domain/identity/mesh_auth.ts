/**
 * Mesh Authentication Service: Manages the internal PKI for mTLS communication.
 * Stores certificates and keys in Deno KV for persistence and cross-node sync.
 *
 * SECURITY: Private keys are encrypted at rest using AES-256-GCM with a key
 * derived from the PKI_SECRET environment variable via PBKDF2.
 */

export interface CertPair {
  cert: string;
  key: string;
  timestamp: number;
}

/**
 * Encrypted envelope stored in KV. Contains the AES-GCM encrypted private key,
 * the IV used for encryption, and the PBKDF2 salt for key derivation.
 */
interface EncryptedCertPair {
  cert: string;
  encryptedKey: string;   // base64-encoded AES-GCM ciphertext
  iv: string;             // base64-encoded IV
  salt: string;           // base64-encoded PBKDF2 salt
  timestamp: number;
}

export class MeshAuthService {
  private readonly CA_KEY = ["mesh", "pki", "root_ca_v5"];
  private readonly NODES_PREFIX = ["mesh", "pki", "nodes_v3"];

  constructor(private kv: Deno.Kv) {}

  /**
   * Generates or retrieves the root CA for the mesh.
   */
  async getRootCA(): Promise<CertPair> {
    const entry = await this.kv.get<EncryptedCertPair>(this.CA_KEY);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    if (entry.value && entry.value.timestamp > thirtyDaysAgo) {
      return await this.decryptCertPair(entry.value);
    }

    console.log("[PKI] CA is missing or older than 30 days. Generating/Regenerating Root CA...");
    const ca = await this.generateSelfSignedCA();
    await this.kv!.set(this.CA_KEY, await this.encryptCertPair(ca));

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
    const entry = await this.kv.get<EncryptedCertPair>(nodeKey);

    if (entry.value) return await this.decryptCertPair(entry.value);

    const certPair = await this.issueNodeCert(nodeId);
    await this.kv!.set(nodeKey, await this.encryptCertPair(certPair));
    return certPair;
  }

  /**
   * Rotates a specific node certificate.
   */
  async rotateCert(nodeId: string): Promise<CertPair> {
    const certPair = await this.issueNodeCert(nodeId);
    await this.kv.set([...this.NODES_PREFIX, nodeId], await this.encryptCertPair(certPair));
    return certPair;
  }

  // --- Encryption helpers ---

  /**
   * Gets the PKI encryption secret. Falls back to API_TOKEN if PKI_SECRET is not set.
   */
  private getPkiSecret(): string {
    const secret = Deno.env.get("PKI_SECRET");
    if (!secret) {
      throw new Error("[PKI] CRITICAL: PKI_SECRET is not set. PKI operations aborted for security.");
    }
    return secret;
  }

  /**
   * Derives an AES-256-GCM key from the PKI secret using PBKDF2.
   */
  private async deriveKey(salt: Uint8Array): Promise<CryptoKey> {
    const secret = this.getPkiSecret();
    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(secret);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      secretBytes.buffer as ArrayBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer as ArrayBuffer,
        iterations: 100_000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts a CertPair's private key using AES-256-GCM.
   * The certificate itself is stored in plaintext (it's public).
   */
  private async encryptCertPair(pair: CertPair): Promise<EncryptedCertPair> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(salt);

    const encoder = new TextEncoder();
    const plaintext = encoder.encode(pair.key);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      plaintext.buffer as ArrayBuffer
    );

    return {
      cert: pair.cert,
      encryptedKey: this.toBase64(new Uint8Array(encrypted)),
      iv: this.toBase64(iv),
      salt: this.toBase64(salt),
      timestamp: pair.timestamp,
    };
  }

  /**
   * Decrypts an EncryptedCertPair back to a CertPair.
   */
  private async decryptCertPair(encrypted: EncryptedCertPair): Promise<CertPair> {
    const salt = this.fromBase64(encrypted.salt);
    const iv = this.fromBase64(encrypted.iv);
    const ciphertext = this.fromBase64(encrypted.encryptedKey);
    const key = await this.deriveKey(salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return {
      cert: encrypted.cert,
      key: new TextDecoder().decode(decrypted),
      timestamp: encrypted.timestamp,
    };
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private fromBase64(str: string): Uint8Array {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // --- Certificate generation ---

  private async rotateAllNodeCerts() {
    console.log("[PKI] Rotating all node certificates due to CA regeneration...");
    const iter = this.kv.list<EncryptedCertPair>({ prefix: this.NODES_PREFIX });
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
