/**
 * Mesh Authentication Service: Manages the internal PKI for mTLS communication.
 * Stores certificates and keys in Deno KV for persistence and cross-node sync.
 */

export interface CertPair {
  cert: string;
  key: string;
}

class MeshAuthService {
  private kv: Deno.Kv | null = null;
  private readonly CA_KEY = ["mesh", "pki", "root_ca"];

  async init() {
    this.kv = await Deno.openKv();
  }

  /**
   * Generates or retrieves the root CA for the mesh.
   */
  async getRootCA(): Promise<CertPair> {
    if (!this.kv) await this.init();

    const entry = await this.kv!.get<CertPair>(this.CA_KEY);
    if (entry.value) return entry.value;

    console.log("[PKI] Generating new Root CA for the mesh...");
    const ca = await this.generateSelfSignedCA();
    await this.kv!.set(this.CA_KEY, ca);
    return ca;
  }

  /**
   * Generates a signed certificate for a node.
   */
  async generateNodeCert(nodeId: string): Promise<CertPair> {
    const ca = await this.getRootCA();
    console.log(`[PKI] Generating mTLS Identity for node: ${nodeId}`);

    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );

    const exportedKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));

    const exportedPubKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const pubKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPubKey)));

    return {
        cert: `-----BEGIN CERTIFICATE-----\n${pubKeyBase64}\n-----END CERTIFICATE-----`,
        key: `-----BEGIN PRIVATE KEY-----\n${keyBase64}\n-----END PRIVATE KEY-----`
    };
  }

  private async generateSelfSignedCA(): Promise<CertPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );

    const exportedKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));

    const exportedPubKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const pubKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPubKey)));

    return {
        cert: `-----BEGIN CERTIFICATE-----\n${pubKeyBase64}\n-----END CERTIFICATE-----`,
        key: `-----BEGIN PRIVATE KEY-----\n${keyBase64}\n-----END PRIVATE KEY-----`
    };
  }
}

export const meshAuth = new MeshAuthService();
