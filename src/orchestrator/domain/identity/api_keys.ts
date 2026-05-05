import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { KvRepository } from "@infrastructure/persistence/repositories/kv_repository.ts";
import { withTelemetry } from "@core/service_utils.ts";

export type Role = "admin" | "operator" | "viewer" | "mesh_peer";

export interface ApiKeyMetadata {
  id: string;
  name: string;
  role: Role;
  createdAt: number;
  lastUsed?: number;
}

export class ApiKeysService {
  private hashRepo: KvRepository<ApiKeyMetadata>;
  private idRepo: KvRepository<string>;
  public createApiKey: (name: string, role: Role) => Promise<any>;
  public validateApiKey: (rawKey: string | undefined) => Promise<any>;
  public revokeApiKey: (id: string) => Promise<any>;

  constructor(private kv: Deno.Kv, private logging: LoggingPort) {
    this.hashRepo = new KvRepository<ApiKeyMetadata>(kv, "api_keys_hash");
    this.idRepo = new KvRepository<string>(kv, "api_keys_id");

    // Wrap public methods
    this.createApiKey = withTelemetry("Auth:CreateKey", this._createApiKey.bind(this), logging);
    this.validateApiKey = withTelemetry("Auth:ValidateKey", this._validateApiKey.bind(this), logging);
    this.revokeApiKey = withTelemetry("Auth:RevokeKey", this._revokeApiKey.bind(this), logging);
  }

  /**
   * Hashes a raw API key with a salt using SHA-256.
   */
  private async hashKey(rawKey: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Generates a new API key for a specific role.
   */
  private async _createApiKey(name: string, role: Role): Promise<{ rawKey: string; id: string }> {
    if (role === "admin" || role === "mesh_peer") {
      throw new Error("Cannot create API keys for internal or admin roles");
    }

    const id = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const secret = crypto.randomUUID().replace(/-/g, "");
    
    // New Format: ct_[role]_[id]_[secret]
    const rawKey = `ct_${role}_${id}_${secret}`;
    const keyHash = await this.hashKey(rawKey, salt);
    
    const metadata: ApiKeyMetadata & { salt: string } = {
      id,
      name,
      role,
      salt,
      createdAt: Date.now(),
    };

    // Store by ID so we can find it first, then verify the hash
    await this.idRepo.set(id, keyHash);
    await this.hashRepo.set(keyHash, metadata as any);

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "AUTH",
        message: `API Key created: ${name} (${role})`
    });
    
    return { rawKey, id };
  }

  /**
   * Validates a raw API key.
   */
  private async _validateApiKey(rawKey: string | undefined): Promise<Role | null> {
    if (!rawKey) return null;
    const parts = rawKey.split("_");
    if (parts.length < 4 || parts[0] !== "ct") return null;

    const id = parts[2];
    try {
      // 1. Get the expected hash for this ID
      const expectedHash = await this.idRepo.get(id);
      if (!expectedHash) return null;

      // 2. Get the metadata (including the salt)
      const metadata = await this.hashRepo.get(expectedHash) as any;
      if (!metadata || !metadata.salt) return null;

      // 3. Re-hash the provided key with the stored salt
      const providedHash = await this.hashKey(rawKey, metadata.salt);

      // 4. Constant-time comparison to prevent timing attacks
      const { secureCompare } = await import("@infrastructure/system/validation.ts");
      if (await secureCompare(providedHash, expectedHash)) {
        metadata.lastUsed = Date.now();
        this.hashRepo.set(expectedHash, metadata).catch(() => {});
        return metadata.role;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Lists all API keys (masked, metadata only).
   */
  async listApiKeys(): Promise<ApiKeyMetadata[]> {
    const keys: ApiKeyMetadata[] = [];
    const hashes = await this.idRepo.list();
    
    for (const keyHash of hashes) {
      const metadata = await this.hashRepo.get(keyHash);
      if (metadata) keys.push(metadata);
    }
    
    return keys;
  }

  /**
   * Revokes an API key by its ID.
   */
  private async _revokeApiKey(id: string): Promise<void> {
    const keyHash = await this.idRepo.get(id);
    if (!keyHash) return;

    await this.hashRepo.delete(keyHash);
    await this.idRepo.delete(id);
  }
}
