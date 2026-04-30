import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export type Role = "admin" | "operator" | "viewer" | "mesh_peer";

export interface ApiKeyMetadata {
  id: string;
  name: string;
  role: Role;
  createdAt: number;
  lastUsed?: number;
}

const API_KEYS_PREFIX = ["api_keys"];

export class ApiKeysService {
  constructor(private kv: Deno.Kv, private logging: LoggingPort) {}

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
    await this.kv.set([...API_KEYS_PREFIX, "hash", keyHash], metadata);
    // Store by ID for list/revoke operations
    await this.kv.set([...API_KEYS_PREFIX, "id", id], keyHash);

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
      const entry = await this.kv.get<ApiKeyMetadata>([...API_KEYS_PREFIX, "hash", keyHash]);
      
      if (entry.value) {
        // Update last used timestamp (fire and forget to avoid blocking auth)
        entry.value.lastUsed = Date.now();
        this.kv.set([...API_KEYS_PREFIX, "hash", keyHash], entry.value).catch(() => {});
        return entry.value.role;
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
    const iter = this.kv.list<string>({ prefix: [...API_KEYS_PREFIX, "id"] });
    
    for await (const entry of iter) {
      const keyHash = entry.value;
      const metaEntry = await this.kv.get<ApiKeyMetadata>([...API_KEYS_PREFIX, "hash", keyHash]);
      if (metaEntry.value) {
        keys.push(metaEntry.value);
      }
    }
    
    return keys;
  }

  /**
   * Revokes an API key by its ID.
   */
  async revokeApiKey(id: string): Promise<void> {
    const idEntry = await this.kv.get<string>([...API_KEYS_PREFIX, "id", id]);
    if (!idEntry.value) return;

    const keyHash = idEntry.value;
    const metaEntry = await this.kv.get<ApiKeyMetadata>([...API_KEYS_PREFIX, "hash", keyHash]);
    
    await this.kv.atomic()
      .delete([...API_KEYS_PREFIX, "hash", keyHash])
      .delete([...API_KEYS_PREFIX, "id", id])
      .commit();

    if (metaEntry.value) {
      this.logging.log(`[AUTH] API Key revoked: ${metaEntry.value.name} (${metaEntry.value.role})`, SyslogSeverity.NOTICE);
    }
  }
}
