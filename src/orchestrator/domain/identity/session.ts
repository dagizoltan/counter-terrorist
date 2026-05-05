/**
 * Session Management Service.
 *
 * Manages ephemeral, revocable browser sessions stored in Deno KV.
 * Session IDs are random UUIDs — the raw API_TOKEN is never stored client-side.
 */

import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { Role } from "./api_keys.ts";
import { KvRepository } from "@infrastructure/persistence/repositories/kv_repository.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { withTelemetry } from "@core/service_utils.ts";

export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
  role: Role;
}

export class SessionService {
  public createSession: (role?: Role) => Promise<any>;
  public validateSession: (sessionId: string | undefined) => Promise<any>;
  public revokeAllSessions: () => Promise<any>;
  private ttlMs: number;
  private repo: KvRepository<Session>;

  constructor(
    private kv: Deno.Kv,
    private logging: LoggingPort,
    ttlHours: number = 24,
  ) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.repo = new KvRepository<Session>(kv, "sessions");

    // Wrap public methods
    this.createSession = withTelemetry("Session:Create", this._createSession.bind(this), logging);
    this.validateSession = withTelemetry("Session:Validate", this._validateSession.bind(this), logging);
    this.revokeAllSessions = withTelemetry("Session:RevokeAll", this._revokeAllSessions.bind(this), logging);

    // Initial prune and setup interval (every 1 hour)
    this.pruneExpiredSessions();
    setInterval(() => this.pruneExpiredSessions(), 60 * 60 * 1000);
  }

  /**
   * Background task to remove expired sessions from KV.
   */
  public async pruneExpiredSessions(): Promise<void> {
    try {
      const now = Date.now();
      const sessions = await this.repo.list();
      let pruned = 0;
      
      for (const session of sessions) {
        if (now > session.expiresAt) {
          await this.repo.delete(session.id);
          pruned++;
        }
      }
      
      if (pruned > 0) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "SESSION",
            message: `Pruned ${pruned} expired sessions from KV storage.`
        });
      }
    } catch (e) {
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.WARNING,
          caller: "SESSION",
          message: `Prune failed: ${(e as Error).message}`
      });
    }
  }

  private async _createSession(role: Role = "admin"): Promise<{ sessionId: string; csrfToken: string }> {
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      csrfToken,
      role,
    };

    await this.repo.set(sessionId, session);
    return { sessionId, csrfToken };
  }

  /**
   * Validates a session ID. Returns the session if valid and not expired, null otherwise.
   */
  private async _validateSession(sessionId: string | undefined): Promise<Session | null> {
    if (!sessionId) return null;

    try {
      const session = await this.repo.get(sessionId);
      if (!session) return null;

      if (Date.now() > session.expiresAt) {
        await this.repo.delete(sessionId);
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Validates the CSRF token for a given session.
   * Uses constant-time comparison to prevent timing attacks.
   */
  async validateCsrf(sessionId: string | undefined, csrfToken: string | undefined): Promise<boolean> {
    if (!sessionId || !csrfToken) return false;

    const result = await this.validateSession(sessionId);
    if (!result.success || !result.data) return false;

    // Constant-time comparison for CSRF token
    return await secureCompare(result.data.csrfToken, csrfToken);
  }

  /**
   * Revokes a single session.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.repo.delete(sessionId);
  }

  /**
   * Revokes all sessions (e.g. on token rotation or security incident).
   */
  private async _revokeAllSessions(): Promise<void> {
    const sessions = await this.repo.list();
    for (const session of sessions) {
      await this.repo.delete(session.id);
    }
  }
}
