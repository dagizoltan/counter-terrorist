import { LoggingPort, SyslogSeverity } from "../../core/ports.ts";
import { KvRepository } from "../../infrastructure/repositories/kv_repository.ts";
import { withTelemetry } from "../../core/service_utils.ts";

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

  constructor(private kv: Deno.Kv, private logging: LoggingPort) {
    this.hashRepo = new KvRepository<ApiKeyMetadata>(kv, "api_keys_hash");
    this.idRepo = new KvRepository<string>(kv, "api_keys_id");

    // Wrap public methods
    this.createApiKey = withTelemetry("Auth:CreateKey", this.createApiKey.bind(this), logging) as any;
    this.validateApiKey = withTelemetry("Auth:ValidateKey", this.validateApiKey.bind(this), logging) as any;
    this.revokeApiKey = withTelemetry("Auth:RevokeKey", this.revokeApiKey.bind(this), logging) as any;
  }

  /**
   * Hashes a raw API key using SHA-256 to ensure we never store plaintext keys.
   */
  private async hashKey(rawKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Generates a new API key for a specific role.
   * Returns the raw key (only time it is visible) and its ID.
   */
  async createApiKey(name: string, role: Role): Promise<{ rawKey: string; id: string }> {
    if (role === "admin" || role === "mesh_peer") {
      throw new Error("Cannot create API keys for internal or admin roles");
    }

    const id = crypto.randomUUID();
    const rawKey = `ct_${role}_${crypto.randomUUID().replace(/-/g, "")}`;
    const keyHash = await this.hashKey(rawKey);
    
    const metadata: ApiKeyMetadata = {
      id,
      name,
      role,
      createdAt: Date.now(),
    };

    // Store by hash for fast lookup during authentication
    await this.hashRepo.set(keyHash, metadata);
    // Store by ID for list/revoke operations
    await this.idRepo.set(id, keyHash);

    this.logging.log(`[AUTH] API Key created: ${name} (${role})`, SyslogSeverity.NOTICE);
    
    return { rawKey, id };
  }

  /**
   * Validates a raw API key and returns its role if valid.
   */
  async validateApiKey(rawKey: string): Promise<Role | null> {
    if (!rawKey.startsWith("ct_")) return null;

    try {
      const keyHash = await this.hashKey(rawKey);
      const metadata = await this.hashRepo.get(keyHash);
      
      if (metadata) {
        metadata.lastUsed = Date.now();
        this.hashRepo.set(keyHash, metadata).catch(() => {});
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
  async revokeApiKey(id: string): Promise<void> {
    const keyHash = await this.idRepo.get(id);
    if (!keyHash) return;

    await this.hashRepo.delete(keyHash);
    await this.idRepo.delete(id);
  }
}
