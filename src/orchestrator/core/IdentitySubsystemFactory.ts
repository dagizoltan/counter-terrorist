import {
    SessionService, ApiKeysService, RateLimitService, MeshAuthService
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { LoggingPort } from "@core/ports.ts";
import { KvSessionRepository } from "@infrastructure/persistence/kv/kv_session_repository.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

export class IdentitySubsystemFactory {
    constructor(
        private kv: Deno.Kv,
        private logging: LoggingPort,
        private sidecarManager: SidecarManager
    ) {}

    initIdentity(config: EnvConfigProvider): {
        sessions: import("@domain/index.ts").SessionService;
        apiKeys: import("@domain/index.ts").ApiKeysService;
        rateLimit: import("@domain/index.ts").RateLimitService;
        meshAuth: import("@domain/index.ts").MeshAuthService;
    } {
        const sessionRepo = new KvSessionRepository(this.kv);
        const sessions = new SessionService(sessionRepo, this.logging, config.getNumber("SESSION_TTL_HOURS", 24));
        const apiKeys = new ApiKeysService(this.kv, this.logging);
        const rateLimit = new RateLimitService(this.kv);
        const meshAuth = new MeshAuthService(this.kv, this.logging, config, this.sidecarManager.getTpm());
        return { sessions, apiKeys, rateLimit, meshAuth };
    }
}
