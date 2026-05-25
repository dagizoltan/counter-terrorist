import { LoggingPort, LogSeverity, LogType, TpmPort, ConfigurationPort, MeshAuthPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";
import { BaseService } from "@core/base_service.ts";

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

export class MeshAuthService extends BaseService implements MeshAuthPort {
  private readonly CA_KEY = ["mesh", "pki", "root_ca_v5"];
  private readonly NODES_PREFIX = ["mesh", "pki", "nodes_v3"];

  constructor(
    private kv: Deno.Kv,
    private logging: LoggingPort,
    private config: ConfigurationPort,
    private tpm?: TpmPort
  ) {
    super();
  }

  protected override onInit(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  protected override onShutdown(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  /**
   * Generates or retrieves the root CA for the mesh.
   */
  async getRootCA(): Promise<Result<CertPair>> {
    try {
        const entry = await this.kv.get<EncryptedCertPair>(this.CA_KEY);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

        if (entry.value && entry.value.timestamp > thirtyDaysAgo) {
          const decrypted = await this.decryptCertPair(entry.value);
          if (decrypted) return ok(decrypted);
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.WARNING,
              caller: "PKI",
              message: "Existing Root CA decryption failed. Secret may have rotated. Regenerating..."
          });
        }

        // BUG-07: Dual-trust transition. Keep the old CA in a backup key to allow
        // offline nodes a grace period to rejoin and update.
        if (entry.value) {
            await this.kv.set(["mesh", "pki", "prev_root_ca"], entry.value);
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "PKI",
            message: "CA is missing or older than 30 days. Generating/Regenerating Root CA..."
        });
        const caResult = await this.generateSelfSignedCA();
        if (!caResult.success) return caResult;
        const ca = caResult.data;

        await this.kv!.set(this.CA_KEY, await this.encryptCertPair(ca));

        // If we regenerated the CA, we MUST regenerate all node certs
        if (entry.value) {
          await this.rotateAllNodeCerts();
        }

        return ok(ca);
    } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * BUG-07: Returns both current and previous (if any) Root CAs for dual-trust handshakes.
   */
  async getTrustedCerts(): Promise<string[]> {
    const res = await this.getRootCA();
    const certs = res.success ? [res.data.cert] : [];

    const prevEntry = await this.kv.get<EncryptedCertPair>(["mesh", "pki", "prev_root_ca"]);
    if (prevEntry.value) {
        certs.push(prevEntry.value.cert);
    }

    return certs;
  }

  /**
   * Generates a signed certificate for a node.
   */
  async generateNodeCert(nodeId: string): Promise<Result<CertPair>> {
    try {
        const nodeKey = [...this.NODES_PREFIX, nodeId];
        const entry = await this.kv.get<EncryptedCertPair>(nodeKey);

        if (entry.value) {
          const decrypted = await this.decryptCertPair(entry.value);
          if (decrypted) return ok(decrypted);
        }

        const certPairResult = await this.issueNodeCert(nodeId);
        if (!certPairResult.success) return certPairResult;

        const certPair = certPairResult.data;
        await this.kv!.set(nodeKey, await this.encryptCertPair(certPair));
        return ok(certPair);
    } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Rotates a specific node certificate.
   */
  async rotateCert(nodeId: string): Promise<Result<CertPair>> {
    try {
        const certPairResult = await this.issueNodeCert(nodeId);
        if (!certPairResult.success) return certPairResult;

        const certPair = certPairResult.data;
        await this.kv.set([...this.NODES_PREFIX, nodeId], await this.encryptCertPair(certPair));
        return ok(certPair);
    } catch (e) {
        return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // --- Encryption helpers ---

  /**
   * Gets the PKI encryption secret. Falls back to API_TOKEN if PKI_SECRET is not set.
   */
  private async getPkiSecret(): Promise<string> {
    // 1. Try TPM (Hardware-Rooted Root of Trust)
    if (this.tpm) {
        const sealed = await this.tpm.unsealSecret("PKI_SECRET");
        if (sealed) return sealed;
    }

    // 2. Fallback to ENV (Standard Production Mode)
    // SOV-06 HARDENING: Removed fallback to API_TOKEN for PKI secrets to ensure strictly isolated credential domains.
    const secret = this.config?.getEnv("PKI_SECRET");
    const needsSealing = !!secret;
    
    if (!secret) {
        throw new Error("[PKI] CRITICAL: PKI_SECRET is not set. Mesh authentication remains dormant for security.");
    }

    // 3. Seal to TPM for future cold-boot resilience (only if it came from environment)
    if (this.tpm && secret && needsSealing) {
        await this.tpm.sealSecret("PKI_SECRET", secret);
    }

    return secret;
  }

  /**
   * Derives an AES-256-GCM key from the PKI secret using PBKDF2.
   */
  private async deriveKey(salt: Uint8Array): Promise<CryptoKey> {
    const secret = await this.getPkiSecret();
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
    // SEC: Safety check on cert/key size before storing to KV
    if (pair.cert.length > 32768 || pair.key.length > 32768) {
        throw new Error("[PKI] Certificate or key size exceeds safety limits (32KB).");
    }

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
  private async decryptCertPair(encrypted: EncryptedCertPair): Promise<CertPair | null> {
    const salt = this.fromBase64(encrypted.salt);
    const iv = this.fromBase64(encrypted.iv);
    const ciphertext = this.fromBase64(encrypted.encryptedKey);
    const key = await this.deriveKey(salt);

    try {
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
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "PKI",
          message: `Decryption failed: ${(e as Error).message}. Possible secret mismatch.`
      });
      return null;
    }
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
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "PKI",
        message: "Rotating all node certificates due to CA regeneration..."
    });
    const iter = this.kv.list<EncryptedCertPair>({ prefix: this.NODES_PREFIX });
    for await (const entry of iter) {
      const nodeId = entry.key[entry.key.length - 1] as string;
      await this.rotateCert(nodeId);
    }
  }

  private async issueNodeCert(nodeId: string): Promise<Result<CertPair>> {
    // SECURITY: Sanitize nodeId to prevent configuration injection
    const safeNodeId = nodeId.replace(/[^a-zA-Z0-9\.\-]/g, "");
    const caRes = await this.getRootCA();
    if (!caRes.success) return caRes;
    const ca = caRes.data as { cert: string; key: string };

    if (this.tpm) {
        const res = await this.tpm.issueNodeCert(safeNodeId, ca.cert, ca.key);
        const resData = res.data as Record<string, unknown> | undefined;
        if (res.success && resData && typeof resData.cert === "string" && typeof resData.key === "string") {
            return ok({
                cert: resData.cert,
                key: resData.key,
                timestamp: Date.now()
            });
        }
        return err(new Error(`TPM Node Cert Issuance failed: ${res.stderr || "Unknown Error"}`));
    }

    return err(new Error("[PKI] CRITICAL: TPMManager (trustroot sidecar) is required for native cert issuance."));
  }

  private async generateSelfSignedCA(): Promise<Result<CertPair>> {
    if (this.tpm) {
        const res = await this.tpm.generateSelfSignedCA("MeshRootCA");
        const resData = res.data as Record<string, unknown> | undefined;
        if (res.success && resData && typeof resData.cert === "string" && typeof resData.key === "string") {
            return ok({
                cert: resData.cert,
                key: resData.key,
                timestamp: Date.now()
            });
        }
        return err(new Error(`TPM CA Generation failed: ${res.stderr || "Unknown Error"}`));
    }

    return err(new Error("[PKI] CRITICAL: TPMManager (trustroot sidecar) is required for native CA generation."));
  }
}
